import { resolve } from "node:path";
import { ACPClient, type SessionUpdateListener } from "../core/acp/ACPClient.ts";
import { StdioACPTransport } from "../core/acp/StdioACPTransport.ts";
import type {
  ACPInitializeParams,
  ACPInitializeResult,
  ACPSessionNewParams,
  ACPSessionNewResult,
  ACPSessionPromptParams,
  ACPSessionPromptResult,
  ACPAuthenticateParams,
  ACPAuthenticateResult,
} from "../core/acp/ACPTypes.ts";
import { CodexNativeClient } from "../bun/providers/codexNative/CodexNativeClient.ts";
import { SMOKE_RUNNER_CLIENT_INFO } from "../shared/appVersion.ts";

export interface RealAgentSmokeOptions {
  cmd: string;
  args: string[];
  cwd: string;
  prompt: string;
  protocolVersion: number;
  transportKind?: "acp" | "codex-native";
  authMethod?: string;
}

export interface RealAgentSmokeClientLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  initialize(params: ACPInitializeParams): Promise<ACPInitializeResult>;
  authenticate?(params: ACPAuthenticateParams): Promise<ACPAuthenticateResult>;
  createSession(params: ACPSessionNewParams): Promise<ACPSessionNewResult>;
  prompt(params: ACPSessionPromptParams): Promise<ACPSessionPromptResult>;
  onSessionUpdate(listener: SessionUpdateListener): void;
  offSessionUpdate?(listener: SessionUpdateListener): void;
}

interface RealAgentSmokeRuntime {
  client: RealAgentSmokeClientLike;
}

export interface RealAgentSmokeRunnerDependencies {
  runtimeFactory?: (
    options: RealAgentSmokeOptions,
    stderrWriter: (line: string) => void,
    onExit: (code: number | null, signal: NodeJS.Signals | null) => void,
  ) => RealAgentSmokeRuntime;
  stdoutWriter?: (line: string) => void;
  stderrWriter?: (line: string) => void;
}

const DEFAULT_PROTOCOL_VERSION = 1;
const DEFAULT_PROMPT = "Hello from smoke runner.";

export class RealAgentSmokeRunner {
  private readonly runtimeFactory: (
    options: RealAgentSmokeOptions,
    stderrWriter: (line: string) => void,
    onExit: (code: number | null, signal: NodeJS.Signals | null) => void,
  ) => RealAgentSmokeRuntime;
  private readonly stdoutWriter: (line: string) => void;
  private readonly stderrWriter: (line: string) => void;

  constructor(dependencies: RealAgentSmokeRunnerDependencies = {}) {
    this.stdoutWriter =
      dependencies.stdoutWriter ??
      ((line) => {
        process.stdout.write(`${line}\n`);
      });
    this.stderrWriter =
      dependencies.stderrWriter ??
      ((line) => {
        process.stderr.write(`${line}\n`);
      });
    this.runtimeFactory =
      dependencies.runtimeFactory ??
      ((options, stderrWriter, onExit) => {
        if (options.transportKind === "codex-native") {
          const client = new CodexNativeClient({
            cwd: options.cwd,
            workspaceRoot: options.cwd,
            onStderr: (chunk) => {
              stderrWriter(chunk);
            },
            onExit,
          });
          return { client };
        }

        const transport = new StdioACPTransport(options.cmd, options.args, {
          cwd: options.cwd,
          onStderr: (chunk) => {
            stderrWriter(chunk);
          },
          onExit,
        });
        const client = new ACPClient(transport);
        return {
          client,
        };
      });
  }

  static parseArgs(argv: string[]): RealAgentSmokeOptions {
    const parsed: RealAgentSmokeOptions = {
      cmd: "",
      args: [],
      cwd: process.cwd(),
      prompt: DEFAULT_PROMPT,
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
    };

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      switch (token) {
        case "--cmd": {
          index += 1;
          parsed.cmd = RealAgentSmokeRunner.requireValue(argv, index, token);
          break;
        }
        case "--args": {
          index += 1;
          const rawArgs = RealAgentSmokeRunner.requireValue(argv, index, token);
          parsed.args.push(...RealAgentSmokeRunner.parseArgsValue(rawArgs));
          break;
        }
        case "--cwd": {
          index += 1;
          parsed.cwd = RealAgentSmokeRunner.requireValue(argv, index, token);
          break;
        }
        case "--prompt": {
          index += 1;
          parsed.prompt = RealAgentSmokeRunner.requireValue(argv, index, token);
          break;
        }
        case "--protocolVersion": {
          index += 1;
          const rawVersion = RealAgentSmokeRunner.requireValue(argv, index, token);
          const parsedVersion = Number.parseInt(rawVersion, 10);
          if (!Number.isInteger(parsedVersion) || parsedVersion < 1) {
            throw new Error(
              `Invalid --protocolVersion value: ${rawVersion}. Expected a positive integer.`,
            );
          }
          parsed.protocolVersion = parsedVersion;
          break;
        }
        case "--transportKind": {
          index += 1;
          const value = RealAgentSmokeRunner.requireValue(argv, index, token);
          if (value !== "acp" && value !== "codex-native") {
            throw new Error(
              `Invalid --transportKind value: ${value}. Expected "acp" or "codex-native".`,
            );
          }
          parsed.transportKind = value;
          break;
        }
        case "--authMethod": {
          index += 1;
          parsed.authMethod = RealAgentSmokeRunner.requireValue(argv, index, token);
          break;
        }
        default:
          throw new Error(
            `Unknown flag: ${token}. Expected --cmd, --args, --cwd, --prompt, --protocolVersion, --transportKind, or --authMethod.`,
          );
      }
    }

    if (!parsed.cmd) {
      throw new Error("Missing required --cmd flag.");
    }

    parsed.cwd = resolve(parsed.cwd);

    return parsed;
  }

  async runWithArgv(argv: string[]): Promise<void> {
    const options = RealAgentSmokeRunner.parseArgs(argv);
    await this.run(options);
  }

  async run(options: RealAgentSmokeOptions): Promise<void> {
    let transportExitError: Error | undefined;
    let disconnecting = false;
    const runtime = this.runtimeFactory(options, this.stderrWriter, (code, signal) => {
      if (!disconnecting && (code !== 0 || signal !== null)) {
        transportExitError = new Error(
          `Agent process exited unexpectedly (code=${String(code)}, signal=${signal ?? "none"}).`,
        );
      }
    });
    const sessionUpdateListener: SessionUpdateListener = (params) => {
      this.stdoutWriter(`[smoke] session/update ${JSON.stringify(params)}`);
    };

    runtime.client.onSessionUpdate(sessionUpdateListener);

    try {
      await runtime.client.connect();

      const initializeResult = await runtime.client.initialize({
        protocolVersion: options.protocolVersion,
        clientCapabilities: {
          terminal: true,
        },
        clientInfo: SMOKE_RUNNER_CLIENT_INFO,
      });

      this.stdoutWriter(
        `[smoke] initialize.agentCapabilities ${JSON.stringify(
          initializeResult.agentCapabilities,
        )}`,
      );
      if (options.authMethod) {
        if (!runtime.client.authenticate) {
          throw new Error("Selected runtime does not support authentication.");
        }
        await runtime.client.authenticate({ methodId: options.authMethod });
        this.stdoutWriter(`[smoke] authenticate.methodId ${options.authMethod}`);
      }

      const sessionResult = await runtime.client.createSession({
        cwd: options.cwd,
        mcpServers: [],
      });

      this.stdoutWriter(`[smoke] sessionId ${sessionResult.sessionId}`);

      const promptResult = await runtime.client.prompt({
        sessionId: sessionResult.sessionId,
        prompt: [
          {
            type: "text",
            text: options.prompt,
          },
        ],
      });

      this.stdoutWriter(`[smoke] prompt.stopReason ${promptResult.stopReason ?? "unknown"}`);
      if (transportExitError) {
        throw transportExitError;
      }
    } catch (error) {
      throw this.toError(error);
    } finally {
      runtime.client.offSessionUpdate?.(sessionUpdateListener);
      disconnecting = true;
      await runtime.client.disconnect();
    }
  }

  static async main(argv: string[] = process.argv.slice(2)): Promise<number> {
    const runner = new RealAgentSmokeRunner();
    try {
      await runner.runWithArgv(argv);
      return 0;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      process.stderr.write(`[smoke] ${normalizedError.message}\n`);
      return 1;
    }
  }

  private static requireValue(argv: string[], index: number, flag: string): string {
    const value = argv[index];
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}.`);
    }
    return value;
  }

  private static parseArgsValue(rawValue: string): string[] {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(trimmed);
      } catch {
        throw new Error(
          `Invalid --args JSON array: ${rawValue}. Expected a JSON array of strings.`,
        );
      }

      if (!Array.isArray(parsedJson) || parsedJson.some((item) => typeof item !== "string")) {
        throw new Error(
          `Invalid --args JSON array: ${rawValue}. Expected a JSON array of strings.`,
        );
      }

      return parsedJson;
    }

    return trimmed.split(/\s+/u);
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
}
