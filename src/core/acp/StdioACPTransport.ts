import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { ACPTransport } from "./ACPTransport.ts";
import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse,
  ACPRequestId,
} from "./ACPTypes.ts";

export interface StdioACPTransportOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onStderr?: (chunk: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  onMessageReceived?: (message: ACPInboundMessage) => void;
  onMessageSent?: (
    message: ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
  ) => void;
  spawnImplementation?: typeof spawn;
}

export class StdioACPTransport extends ACPTransport {
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly cwd?: string;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly onStderr?: (chunk: string) => void;
  private readonly onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  private readonly onMessageReceived?: (message: ACPInboundMessage) => void;
  private readonly onMessageSent?: (
    message: ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
  ) => void;
  private readonly spawnImplementation: typeof spawn;

  private process?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = "";

  constructor(command: string, args: string[] = [], options: StdioACPTransportOptions = {}) {
    super();
    this.command = command;
    this.args = args;
    this.cwd = options.cwd;
    this.env = options.env;
    this.onStderr = options.onStderr;
    this.onExit = options.onExit;
    this.onMessageReceived = options.onMessageReceived;
    this.onMessageSent = options.onMessageSent;
    this.spawnImplementation = options.spawnImplementation ?? spawn;
  }

  async connect(): Promise<void> {
    if (this.process) {
      return;
    }

    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: this.cwd,
      env: this.env,
      stdio: "pipe",
    };

    const child = this.spawnImplementation(
      this.command,
      [...this.args],
      spawnOptions,
    ) as ChildProcessWithoutNullStreams;

    this.process = child;
    this.stdoutBuffer = "";

    child.stdout.on("data", this.handleStdoutData);
    child.stderr.on("data", this.handleStderrData);
    child.on("exit", this.handleProcessExit);
    child.on("error", this.handleProcessError);
  }

  async disconnect(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    this.stdoutBuffer = "";

    if (!child) {
      return;
    }

    child.stdout.off("data", this.handleStdoutData);
    child.stderr.off("data", this.handleStderrData);
    child.off("exit", this.handleProcessExit);
    child.off("error", this.handleProcessError);

    if (!child.stdin.destroyed) {
      child.stdin.end();
    }

    if (child.exitCode === null && child.signalCode === null && !child.killed) {
      child.kill();
    }

    await this.waitForExit(child);

    if (!child.stdin.destroyed) {
      child.stdin.destroy();
    }
    child.stdout.destroy();
    child.stderr.destroy();
  }

  async sendRequest(request: ACPJsonRpcRequest): Promise<void> {
    await this.writeMessage(request);
  }

  async sendNotification(notification: ACPJsonRpcNotification): Promise<void> {
    await this.writeMessage(notification);
  }

  async sendResponse(response: ACPJsonRpcResponse): Promise<void> {
    await this.writeMessage(response);
  }

  private async writeMessage(
    message: ACPJsonRpcRequest | ACPJsonRpcNotification | ACPJsonRpcResponse,
  ): Promise<void> {
    this.onMessageSent?.(message);
    await this.writeLine(`${JSON.stringify(message)}\n`);
  }

  private async writeLine(line: string): Promise<void> {
    const child = this.process;
    if (!child || child.stdin.destroyed || !child.stdin.writable) {
      throw new Error("ACP stdio transport is not connected.");
    }

    await new Promise<void>((resolve, reject) => {
      child.stdin.write(line, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      const onExit = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      const timeoutId = setTimeout(() => {
        child.off("exit", onExit);
        resolve();
      }, 500);

      child.once("exit", onExit);
    });
  }

  private readonly handleStdoutData = (chunk: Buffer | string): void => {
    this.stdoutBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const rawLine = this.stdoutBuffer.slice(0, newlineIndex);
      const line = rawLine.replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      this.handleStdoutLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  };

  private handleStdoutLine(line: string): void {
    if (line.length === 0) {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (!this.isInboundMessage(message)) {
      return;
    }

    this.onMessageReceived?.(message);
    this.dispatchIncomingMessage(message);
  }

  private isInboundMessage(value: unknown): value is ACPInboundMessage {
    if (!this.isRecord(value) || value.jsonrpc !== "2.0") {
      return false;
    }

    if ("method" in value) {
      if (typeof value.method !== "string") {
        return false;
      }
      if (!("id" in value)) {
        return true;
      }
      return this.isRequestId(value.id);
    }

    if (!("id" in value)) {
      return false;
    }

    if (!this.isRequestId(value.id)) {
      return false;
    }

    if ("result" in value) {
      return true;
    }

    if (!this.isRecord(value.error)) {
      return false;
    }

    return typeof value.error.code === "number" && typeof value.error.message === "string";
  }

  private isRequestId(value: unknown): value is ACPRequestId {
    return typeof value === "number" || typeof value === "string" || value === null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private readonly handleStderrData = (chunk: Buffer | string): void => {
    if (!this.onStderr) {
      return;
    }

    const stderrChunk = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    this.onStderr(stderrChunk);
  };

  private readonly handleProcessExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    this.process = undefined;
    this.stdoutBuffer = "";
    this.onExit?.(code, signal);
  };

  private readonly handleProcessError = (error: Error): void => {
    this.onStderr?.(error.message);
  };
}
