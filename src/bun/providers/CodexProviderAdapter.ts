import type { SmokeProvider } from "../../shared/providerModels.ts";
import {
  extractChunkText,
  extractToolErrorText,
  extractUsage,
  summarizeSessionUpdate,
} from "../acpHelpers.ts";
import type { CodexNativeClient } from "./codexNative/CodexNativeClient.ts";
import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderEvent,
  ProviderSessionHandle,
  ProviderUserInputOutcome,
} from "./providerContract.ts";
import {
  cloneProviderConfigState,
  createProviderSessionHandleFromACP,
  updateProviderConfigOptionValue,
} from "./providerContractHelpers.ts";

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export class CodexProviderAdapter implements ProviderAdapter {
  readonly provider: SmokeProvider;
  readonly transportKind = "codex-native" as const;

  private readonly client: CodexNativeClient;
  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private readonly sessions = new Map<string, ProviderSessionHandle>();
  private readonly pendingApprovals = new Map<
    string,
    (value: { outcome: "cancelled" } | { outcome: "selected"; optionId: string }) => void
  >();
  private readonly pendingUserInputs = new Map<string, (value: ProviderUserInputOutcome) => void>();
  private capabilities?: ProviderCapabilities;

  constructor(provider: SmokeProvider, client: CodexNativeClient) {
    this.provider = provider;
    this.client = client;

    this.client.onSessionUpdate((params) => {
      this.handleSessionUpdate(params.sessionId, params.update);
    });
    this.client.setPermissionRequestHandler(
      async ({ requestId, sessionId, toolCall, options, _meta }) => {
        const approvalId = String(requestId);
        this.emit({
          type: "approval_request",
          request: {
            approvalId,
            sessionId,
            requestId:
              typeof _meta?.requestId === "string" ? (_meta.requestId as string) : undefined,
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
          this.pendingApprovals.set(approvalId, resolve);
        });
      },
    );
    this.client.setUserInputRequestHandler(async ({ requestId, sessionId, fields, _meta }) => {
      const inputId = String(requestId);
      this.emit({
        type: "user_input_request",
        request: {
          inputId,
          sessionId,
          requestId: typeof _meta?.requestId === "string" ? (_meta.requestId as string) : undefined,
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
        this.pendingUserInputs.set(inputId, resolve);
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

  async initialize(params: {
    protocolVersion: number;
    clientCapabilities?: Record<string, unknown>;
    clientInfo?: {
      name: string;
      title?: string;
      version: string;
    };
  }): Promise<ProviderCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    const result = await this.client.initialize(params);
    this.capabilities = {
      loadSession: Boolean(result.agentCapabilities.loadSession),
      authMethods: (result.authMethods ?? []).map((method) => method.type),
      supportsTerminalAuth: (result.authMethods ?? []).some((method) => method.type === "terminal"),
      session: {
        list: Boolean(result.agentCapabilities.sessionCapabilities?.list),
        fork: Boolean(result.agentCapabilities.sessionCapabilities?.fork),
        resume: Boolean(result.agentCapabilities.sessionCapabilities?.resume),
        close: Boolean(result.agentCapabilities.sessionCapabilities?.close),
      },
      config: {
        setConfigOption: true,
        setMode: true,
      },
      extensions: {
        userInput: true,
      },
      models: [],
      _meta: result._meta ?? undefined,
    };
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
    const handle = createProviderSessionHandleFromACP(
      this.provider,
      params.cwd,
      this.transportKind,
      result,
      result.sessionId,
    );
    this.sessions.set(handle.sessionId, handle);
    return handle;
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
    const handle = createProviderSessionHandleFromACP(
      this.provider,
      params.cwd,
      this.transportKind,
      result,
      params.sessionId,
    );
    this.sessions.set(handle.sessionId, handle);
    return handle;
  }

  async sendPrompt(params: {
    sessionId: string;
    prompt: Array<{ type: "text"; text: string }>;
  }): Promise<{ stopReason?: string }> {
    const result = await this.client.prompt(params);
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
    await this.client.setConfigOption({
      sessionId: params.sessionId,
      configId: params.optionId,
      value: params.value,
    });
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      return undefined;
    }
    session.config = updateProviderConfigOptionValue(session.config, params.optionId, params.value);
    session.replay.currentModeId = session.config.mode.currentModeId;
    return session;
  }

  async setMode(params: {
    sessionId: string;
    modeId: string;
  }): Promise<ProviderSessionHandle | undefined> {
    await this.client.setMode(params);
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      return undefined;
    }
    const nextConfig = cloneProviderConfigState(session.config);
    nextConfig.mode.currentModeId = params.modeId;
    session.config = nextConfig;
    session.replay.currentModeId = params.modeId;
    return session;
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
    pending(outcome);
  }

  async respondToUserInput(inputId: string, outcome: ProviderUserInputOutcome): Promise<void> {
    const pending = this.pendingUserInputs.get(inputId);
    if (!pending) {
      throw new Error(`Unknown user input request: ${inputId}`);
    }
    this.pendingUserInputs.delete(inputId);
    pending(outcome);
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

  private handleSessionUpdate(
    sessionId: string,
    update: {
      sessionUpdate: string;
      [key: string]: unknown;
    },
  ): void {
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

    if (update.sessionUpdate === "plan_update") {
      const text = extractChunkText(update);
      if (text) {
        this.emit({
          type: "plan_update",
          sessionId,
          plan: {
            format: "text_delta",
            textDelta: text,
          },
        });
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
          kind: readString((update as { kind?: unknown }).kind),
          title: readString((update as { title?: unknown }).title),
          status: readString((update as { status?: unknown }).status),
          input:
            (update as { rawInput?: unknown }).rawInput ?? (update as { input?: unknown }).input,
        },
      });
      return;
    }

    if (update.sessionUpdate === "tool_call_update") {
      const output =
        (update as { rawOutput?: unknown }).rawOutput ?? (update as { output?: unknown }).output;
      this.emit({
        type: "tool_call_update",
        sessionId,
        tool: {
          toolCallId: String(
            (update as { toolCallId?: unknown }).toolCallId ?? crypto.randomUUID(),
          ),
          kind: readString((update as { kind?: unknown }).kind),
          title: readString((update as { title?: unknown }).title),
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
        this.emit({ type: "usage", sessionId, usage });
      }
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
