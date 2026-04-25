import { ACPClient, ACPRequestError } from "../../core/acp/ACPClient.ts";
import { StdioACPTransport } from "../../core/acp/StdioACPTransport.ts";
import type {
  ACPInitializeParams,
  ACPSessionConfigOption,
  ACPSessionLoadResult,
  ACPSessionNewResult,
  ACPSessionPromptResult,
  ACPSessionUpdate,
} from "../../core/acp/ACPTypes.ts";
import {
  extractChunkText,
  extractToolErrorText,
  extractUsage,
  isRecord,
  summarizeSessionUpdate,
} from "../acpHelpers.ts";
import {
  parseAvailableCommands,
  resolveProviderAvailableCommands,
} from "../../core/providers/providerCommands.ts";
import type {
  ProviderAdapter,
  ProviderAdapterDiagnostics,
  ProviderCapabilities,
  ProviderConfigState,
  ProviderEvent,
  ProviderSessionHandle,
  ProviderUserInputOutcome,
} from "./providerContract.ts";
import {
  cloneProviderConfigState,
  createProviderSessionHandleFromACP,
  normalizeProviderCapabilitiesFromACP,
  normalizeProviderConfigOptions,
  normalizeProviderModeState,
  updateProviderConfigOptionValue,
} from "./providerContractHelpers.ts";
import type { SmokeProvider } from "../../shared/providerModels.ts";

interface ACPProviderAdapterOptions {
  provider: SmokeProvider;
  command: string;
  args: string[];
  cwd: string;
  diagnostics?: ProviderAdapterDiagnostics;
}

interface PendingApproval {
  resolve: (value: { outcome: "cancelled" } | { outcome: "selected"; optionId: string }) => void;
}

interface PendingUserInput {
  resolve: (value: ProviderUserInputOutcome) => void;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function hasMeaningfulOutput(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  return true;
}

function readToolName(update: ACPSessionUpdate): string | undefined {
  const meta = (update as { _meta?: unknown })._meta;
  return isRecord(meta) ? readString(meta.toolName) : undefined;
}

export class ACPProviderAdapter implements ProviderAdapter {
  readonly provider: SmokeProvider;
  readonly transportKind = "acp" as const;

  private readonly cwd: string;
  private readonly client: ACPClient;
  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private readonly sessions = new Map<string, ProviderSessionHandle>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly pendingUserInputs = new Map<string, PendingUserInput>();
  private capabilities?: ProviderCapabilities;

  constructor(options: ACPProviderAdapterOptions) {
    this.provider = options.provider;
    this.cwd = options.cwd;
    this.client = new ACPClient(
      new StdioACPTransport(options.command, options.args, {
        cwd: options.cwd,
        onStderr: options.diagnostics?.onStderr,
        onExit: options.diagnostics?.onExit,
        onMessageSent: options.diagnostics?.onMessageSent,
        onMessageReceived: options.diagnostics?.onMessageReceived,
      }),
    );

    this.client.onSessionUpdate((params) => {
      this.handleSessionUpdate(params.sessionId, params.update);
    });
    this.client.setPermissionRequestHandler(async ({ requestId, sessionId, toolCall, options }) => {
      const approvalId = String(requestId);
      this.emit({
        type: "approval_request",
        request: {
          approvalId,
          sessionId,
          toolCallId: toolCall.toolCallId || approvalId,
          toolKind: toolCall.kind ?? undefined,
          rawInput:
            typeof toolCall.rawInput === "string"
              ? toolCall.rawInput
              : toolCall.rawInput == null
                ? undefined
                : JSON.stringify(toolCall.rawInput, null, 2),
          locations: (toolCall.locations ?? []).map((location) => ({
            path: location.path,
            line: location.line ?? undefined,
          })),
          options: options.map((option) => ({
            optionId: option.optionId,
            name: option.name,
            kind: option.kind,
          })),
        },
      });

      return await new Promise((resolve) => {
        this.pendingApprovals.set(approvalId, { resolve });
      });
    });
    this.client.setUserInputRequestHandler(async ({ requestId, sessionId, fields, _meta }) => {
      const inputId = String(requestId);
      this.emit({
        type: "user_input_request",
        request: {
          inputId,
          sessionId,
          fields: fields.map((field) => ({
            id: field.id,
            header: field.header ?? undefined,
            question: field.question,
            options: (field.options ?? []).map((option) => ({
              value: option.value,
              label: option.label,
              description: option.description,
            })),
            allowOther: Boolean(field.isOther),
            secret: Boolean(field.isSecret),
          })),
          _meta: _meta ?? undefined,
        },
      });

      return await new Promise((resolve) => {
        this.pendingUserInputs.set(inputId, { resolve });
      });
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    this.pendingApprovals.clear();
    this.pendingUserInputs.clear();
    this.sessions.clear();
    await this.client.disconnect();
  }

  async initialize(params: ACPInitializeParams): Promise<ProviderCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    const result = await this.client.initialize(params);
    this.capabilities = normalizeProviderCapabilitiesFromACP(result);
    return this.capabilities;
  }

  async createSession(params: {
    cwd: string;
    mcpServers?: unknown[];
  }): Promise<ProviderSessionHandle> {
    const result = await this.client.createSession({
      cwd: params.cwd,
      mcpServers: params.mcpServers as never,
    });
    return this.storeSessionHandle(params.cwd, result, result.sessionId);
  }

  async loadSession(params: {
    sessionId: string;
    cwd: string;
    mcpServers?: unknown[];
  }): Promise<ProviderSessionHandle> {
    const result = await this.client.loadSession({
      sessionId: params.sessionId,
      cwd: params.cwd,
      mcpServers: params.mcpServers as never,
    });
    return this.storeSessionHandle(params.cwd, result, params.sessionId);
  }

  async sendPrompt(params: {
    sessionId: string;
    prompt: Array<{ type: "text"; text: string }>;
  }): Promise<{ stopReason?: string }> {
    const result = (await this.client.prompt({
      sessionId: params.sessionId,
      prompt: params.prompt,
    })) as ACPSessionPromptResult;
    return { stopReason: result.stopReason };
  }

  async cancelTurn(params: { sessionId: string; promptId?: string }): Promise<void> {
    await this.client.cancel(params);
  }

  async setConfigOption(params: {
    sessionId: string;
    optionId: string;
    value: string | boolean;
  }): Promise<ProviderSessionHandle | undefined> {
    try {
      await this.client.setConfigOption({
        sessionId: params.sessionId,
        configId: params.optionId,
        value: params.value,
      });
      return this.updateSessionConfigOption(params.sessionId, params.optionId, params.value);
    } catch (error) {
      if (!(error instanceof ACPRequestError) || error.code !== -32601) {
        throw error;
      }

      if (params.optionId === "model" && typeof params.value === "string") {
        await this.client.setModel({
          sessionId: params.sessionId,
          modelId: params.value,
        });
        return this.updateSessionConfigOption(params.sessionId, params.optionId, params.value);
      }

      const session = this.sessions.get(params.sessionId);
      if (
        typeof params.value === "string" &&
        session?.config.mode.configOptionId === params.optionId
      ) {
        return this.setMode({
          sessionId: params.sessionId,
          modeId: params.value,
        });
      }

      throw error;
    }
  }

  async setMode(params: {
    sessionId: string;
    modeId: string;
  }): Promise<ProviderSessionHandle | undefined> {
    const session = this.sessions.get(params.sessionId);
    if (session?.config.mode.configOptionId) {
      try {
        await this.client.setConfigOption({
          sessionId: params.sessionId,
          configId: session.config.mode.configOptionId,
          value: params.modeId,
        });
        return this.updateSessionConfigOption(
          params.sessionId,
          session.config.mode.configOptionId,
          params.modeId,
        );
      } catch (error) {
        if (!(error instanceof ACPRequestError) || error.code !== -32601) {
          throw error;
        }
      }
    }

    await this.client.setMode(params);
    return this.updateSessionMode(params.sessionId, params.modeId);
  }

  async respondToApproval(
    approvalId: string,
    outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string },
  ): Promise<void> {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      throw new Error(`Unknown approval request: ${approvalId}`);
    }
    this.pendingApprovals.delete(approvalId);
    pending.resolve(outcome);
  }

  async respondToUserInput(inputId: string, outcome: ProviderUserInputOutcome): Promise<void> {
    const pending = this.pendingUserInputs.get(inputId);
    if (!pending) {
      throw new Error(`Unknown user input request: ${inputId}`);
    }
    this.pendingUserInputs.delete(inputId);
    pending.resolve(outcome);
  }

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: ProviderEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private storeSessionHandle(
    cwd: string,
    setup: ACPSessionNewResult | ACPSessionLoadResult,
    sessionId: string,
  ): ProviderSessionHandle {
    const handle = createProviderSessionHandleFromACP(
      this.provider,
      cwd,
      this.transportKind,
      setup,
      sessionId,
    );
    this.sessions.set(sessionId, handle);
    return handle;
  }

  private updateSessionConfigOption(
    sessionId: string,
    optionId: string,
    value: string | boolean,
  ): ProviderSessionHandle | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    session.config = updateProviderConfigOptionValue(session.config, optionId, value);
    session.replay.currentModeId = session.config.mode.currentModeId;
    return session;
  }

  private updateSessionMode(sessionId: string, modeId: string): ProviderSessionHandle | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const nextConfig = cloneProviderConfigState(session.config);
    nextConfig.mode.currentModeId = modeId;
    session.config = nextConfig;
    session.replay.currentModeId = modeId;
    return session;
  }

  private handleSessionUpdate(sessionId: string, update: ACPSessionUpdate): void {
    if (update.sessionUpdate === "available_commands_update") {
      const commands = resolveProviderAvailableCommands(
        this.provider,
        parseAvailableCommands((update as { availableCommands?: unknown }).availableCommands),
      );
      this.emit({
        type: "available_commands",
        sessionId,
        commands,
      });
      return;
    }

    if (update.sessionUpdate === "agent_message_chunk") {
      const text = extractChunkText(update);
      if (text) {
        this.emit({ type: "message_chunk", sessionId, text });
      }
      return;
    }

    if (update.sessionUpdate === "agent_thought_chunk") {
      const text = extractChunkText(update);
      if (text) {
        this.emit({ type: "thought_chunk", sessionId, text });
      }
      return;
    }

    if (update.sessionUpdate === "tool_call") {
      this.emit({
        type: "tool_call",
        sessionId,
        tool: {
          toolCallId: String(
            (update as { toolCallId?: unknown }).toolCallId ?? crypto.randomUUID(),
          ),
          title: readString((update as { title?: unknown }).title),
          kind: readString((update as { kind?: unknown }).kind),
          status: readString((update as { status?: unknown }).status),
          input:
            (update as { rawInput?: unknown }).rawInput ?? (update as { input?: unknown }).input,
        },
      });
      return;
    }

    if (update.sessionUpdate === "tool_call_update") {
      const rawOutput =
        (update as { rawOutput?: unknown }).rawOutput ?? (update as { output?: unknown }).output;
      const content = (update as { content?: unknown }).content;
      const output = hasMeaningfulOutput(rawOutput) ? rawOutput : (content ?? rawOutput);
      const toolName = readToolName(update);
      this.emit({
        type: "tool_call_update",
        sessionId,
        tool: {
          toolCallId: String(
            (update as { toolCallId?: unknown }).toolCallId ?? crypto.randomUUID(),
          ),
          title: readString((update as { title?: unknown }).title),
          kind: readString((update as { kind?: unknown }).kind) ?? toolName,
          status: readString((update as { status?: unknown }).status),
          output,
          errorText: extractToolErrorText(output),
        },
      });
      return;
    }

    if (update.sessionUpdate === "usage_update") {
      const usage = extractUsage(update);
      if (usage) {
        this.emit({
          type: "usage",
          sessionId,
          usage,
        });
      }
      return;
    }

    if (update.sessionUpdate === "config_option_update") {
      const nextConfigOptions = normalizeProviderConfigOptions(
        (update as { configOptions?: ACPSessionConfigOption[] }).configOptions,
      );
      const session = this.sessions.get(sessionId);
      const config = {
        options: nextConfigOptions,
        mode: normalizeProviderModeState(
          nextConfigOptions,
          null,
          session?._meta ?? {
            currentModeId: readString((update as { currentModeId?: unknown }).currentModeId),
          },
        ),
      } satisfies ProviderConfigState;
      if (session) {
        session.config = config;
        session.replay.currentModeId = config.mode.currentModeId;
      }
      this.emit({
        type: "config",
        sessionId,
        config,
        replay: {
          currentModeId: config.mode.currentModeId,
        },
      });
      return;
    }

    const planEntries = formatPlanEntries(update);
    if (planEntries) {
      this.emit({
        type: "reasoning",
        sessionId,
        updateType: update.sessionUpdate,
        summary: "Updated tasks",
        detail: planEntries,
      });
      return;
    }

    const text = extractChunkText(update);
    if (update.sessionUpdate.includes("plan") && text) {
      this.emit({
        type: "plan_update",
        sessionId,
        plan: {
          format: "text_delta",
          textDelta: text,
        },
      });
      return;
    }

    const summary = summarizeSessionUpdate(update);
    if (!summary) {
      return;
    }

    this.emit({
      type: "reasoning",
      sessionId,
      updateType: update.sessionUpdate,
      summary,
    });
  }
}

function formatPlanEntries(update: ACPSessionUpdate): string | undefined {
  if (update.sessionUpdate !== "plan") {
    return undefined;
  }
  const entries = (update as { entries?: unknown }).entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return undefined;
  }

  const lines = entries
    .filter(isRecord)
    .map((entry) => {
      const content = readString(entry.content);
      if (!content) {
        return undefined;
      }
      const status = readString(entry.status)?.replaceAll("_", " ");
      return status ? `${status}: ${content}` : content;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}
