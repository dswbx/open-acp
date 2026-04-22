import { ACPClient } from "../core/acp/ACPClient.ts";
import type { PermissionRequestHandler, SessionUpdateListener } from "../core/acp/ACPClient.ts";
import { StdioACPTransport } from "../core/acp/StdioACPTransport.ts";
import type {
  ACPInitializeParams,
  ACPInitializeResult,
  ACPRequestId,
  ACPRequestPermissionOutcome,
  ACPSessionCancelParams,
  ACPSessionLoadParams,
  ACPSessionLoadResult,
  ACPSessionNewParams,
  ACPSessionNewResult,
  ACPSessionPromptParams,
  ACPSessionPromptResult,
  ACPSessionRequestPermissionParams,
  ACPSessionSetModelParams,
  ACPSessionUpdateParams,
} from "../core/acp/ACPTypes.ts";
import {
  parseAvailableCommands,
  resolveProviderAvailableCommands,
} from "../core/providers/providerCommands.ts";
import type {
  AgentTranscriptEventPayload,
  ApprovalEventPayload,
  AvailableCommand,
  AvailableCommandsEventPayload,
  ChatStreamEventPayload,
  SmokeProvider,
} from "../shared/AppRPC.ts";
import type { RealAgentSmokeOptions } from "../cli/RealAgentSmoke.ts";
import {
  extractChunkText,
  extractToolErrorText,
  extractToolState,
  extractUsage,
  getRequestMapKey,
  isJsonRpcNotificationLike,
  isJsonRpcRequestLike,
  isJsonRpcResponse,
  normalizeLogMessage,
  stringifyRawInput,
  summarizeSessionUpdate,
} from "./acpHelpers.ts";
import { createTimestamp, type SessionReplayRecorder } from "./sessionReplay.ts";
import type { SessionTranscriptStore } from "./SessionTranscriptStore.ts";
import type { createProviderModelCatalogStore } from "./providerModelCatalogStore.ts";
import { normalizeDiscoveredProviderModels } from "./providerModelDiscovery.ts";
import { CodexNativeClient } from "./providers/codexNative/CodexNativeClient.ts";

export interface ProviderRuntimeClientLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  initialize(params: ACPInitializeParams): Promise<ACPInitializeResult>;
  createSession(params: ACPSessionNewParams): Promise<ACPSessionNewResult>;
  loadSession(params: ACPSessionLoadParams): Promise<ACPSessionLoadResult>;
  prompt(params: ACPSessionPromptParams): Promise<ACPSessionPromptResult>;
  cancel(params: ACPSessionCancelParams): Promise<void>;
  setModel(params: ACPSessionSetModelParams): Promise<void>;
  onSessionUpdate(listener: SessionUpdateListener): void;
  offSessionUpdate(listener: SessionUpdateListener): void;
  setPermissionRequestHandler(handler: PermissionRequestHandler | undefined): void;
}

export interface ProviderRuntime {
  provider: SmokeProvider;
  cwd: string;
  client: ProviderRuntimeClientLike;
  transportKind: "acp" | "codex-native";
  sessionId: string;
  currentModel?: string;
  currentModeId?: string;
  activeRequestId?: string;
  pendingApprovals: Map<string, PendingApproval>;
  pendingAssistantMessages: Map<string, PendingAssistantMessage>;
  rpcRequestMethods: Map<string, string>;
  availableCommandsBySession: Map<string, AvailableCommand[]>;
  providerSessionIdsBySession: Map<string, string>;
}

export interface CreateProviderRuntimeOptions {
  skipSessionCreation?: boolean;
}

export interface PendingApproval {
  approvalId: string;
  sessionId: string;
  cwd: string;
  requestId?: string;
  toolCallId: string;
  resolve: (outcome: ACPRequestPermissionOutcome) => void;
}

export interface PendingAssistantMessage {
  requestId: string;
  sessionId: string;
  provider: SmokeProvider;
  model?: string;
  text: string;
  reasoningText?: string;
}

export interface ProviderRuntimeEmitters {
  chatStream(payload: ChatStreamEventPayload): void;
  approval(payload: ApprovalEventPayload): void;
  availableCommands(payload: AvailableCommandsEventPayload): void;
  agentTranscript(payload: AgentTranscriptEventPayload): void;
}

export interface FlushAssistantMessageOptions {
  timestamp: string;
  status: "complete" | "error" | "cancelled";
  stopReason?: string;
  error?: string;
}

export interface ProviderRuntimeManagerOptions {
  workspaceRoot: string;
  defaultPrompt: string;
  sessionReplay: SessionReplayRecorder;
  transcriptStore: SessionTranscriptStore;
  providerModelCatalogStore: ReturnType<typeof createProviderModelCatalogStore>;
  emitters: ProviderRuntimeEmitters;
}

export interface ProviderRuntimeManager {
  ensureProviderRuntime(provider: SmokeProvider, cwd: string): Promise<ProviderRuntime>;
  switchRuntimeSession(runtime: ProviderRuntime, sessionId: string): Promise<void>;
  prepareRuntimeForModel(
    runtime: ProviderRuntime,
    model?: string,
    targetSessionId?: string,
  ): Promise<ProviderRuntime>;
  flushAssistantMessage(
    runtime: ProviderRuntime,
    requestId: string,
    options: FlushAssistantMessageOptions,
  ): Promise<void>;
  emitChatError(runtime: ProviderRuntime, requestId: string, message: string): void;
  resolvePendingApprovals(runtime: ProviderRuntime, outcome: ACPRequestPermissionOutcome): void;
  getRuntime(provider: SmokeProvider): ProviderRuntime | undefined;
}

export function createSmokeRunnerOptions(
  provider: SmokeProvider,
  prompt: string,
  cwd: string,
): RealAgentSmokeOptions {
  const shared = { cwd, prompt, protocolVersion: 1 as const };
  switch (provider) {
    case "codex":
      return { ...shared, cmd: "codex", args: ["app-server"], transportKind: "codex-native" };
    case "claude":
      return {
        ...shared,
        cmd: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp"],
        transportKind: "acp",
      };
    case "qwen":
      return {
        ...shared,
        cmd: "npx",
        args: ["-y", "@qwen-code/qwen-code", "--acp"],
        transportKind: "acp",
      };
    case "opencode":
      return { ...shared, cmd: "opencode", args: ["acp"], transportKind: "acp" };
  }
}

export function createProviderRuntimeManager(
  options: ProviderRuntimeManagerOptions,
): ProviderRuntimeManager {
  const {
    workspaceRoot,
    defaultPrompt,
    sessionReplay,
    transcriptStore,
    providerModelCatalogStore,
    emitters,
  } = options;

  const runtimes = new Map<SmokeProvider, ProviderRuntime>();

  function emitACPTranscript(
    provider: SmokeProvider,
    direction: AgentTranscriptEventPayload["direction"],
    message: unknown,
    requestMethods: Map<string, string>,
    fallbackSessionId?: string,
  ): void {
    const record = typeof message === "object" && message !== null ? message : {};
    let kind: AgentTranscriptEventPayload["kind"];
    let method: string | undefined;
    let requestId: ACPRequestId | undefined;

    if (isJsonRpcRequestLike(record as never)) {
      kind = "request";
      method = (record as { method: string }).method;
      requestId = (record as { id: ACPRequestId }).id;
    } else if (isJsonRpcNotificationLike(record as never)) {
      kind = "notification";
      method = (record as { method: string }).method;
    } else {
      kind = "response";
      requestId =
        typeof (record as { id?: unknown }).id === "string" ||
        typeof (record as { id?: unknown }).id === "number" ||
        (record as { id?: unknown }).id === null
          ? ((record as { id?: ACPRequestId }).id ?? undefined)
          : undefined;
      method =
        requestId === undefined ? undefined : requestMethods.get(getRequestMapKey(requestId));
    }

    const inferredSessionId =
      typeof ((record as { params?: { sessionId?: unknown } }).params?.sessionId) === "string"
        ? ((record as { params: { sessionId: string } }).params.sessionId ?? fallbackSessionId)
        : typeof ((record as { result?: { sessionId?: unknown } }).result?.sessionId) === "string"
          ? ((record as { result: { sessionId: string } }).result.sessionId ?? fallbackSessionId)
          : fallbackSessionId;

    emitters.agentTranscript({
      entryId: crypto.randomUUID(),
      provider,
      sessionId: inferredSessionId,
      direction,
      kind,
      method,
      requestId,
      summary: kind === "response" ? `${method ?? "rpc"} response` : (method ?? kind),
      json: JSON.stringify(record, null, 2),
      timestamp: createTimestamp(),
    });
  }

  function applySessionMeta(
    runtime: ProviderRuntime,
    sessionId: string,
    result: { _meta?: Record<string, unknown> | null } | null | undefined,
  ): void {
    const meta = result?._meta;
    if (!meta || typeof meta !== "object") {
      return;
    }

    if (typeof meta.providerSessionId === "string" && meta.providerSessionId.trim().length > 0) {
      runtime.providerSessionIdsBySession.set(sessionId, meta.providerSessionId);
    }
    if (typeof meta.currentModeId === "string" && meta.currentModeId.trim().length > 0) {
      runtime.currentModeId = meta.currentModeId;
    }
  }

  function flushAssistantMessage(
    runtime: ProviderRuntime,
    requestId: string,
    opts: FlushAssistantMessageOptions,
  ): Promise<void> {
    const pendingMessage = runtime.pendingAssistantMessages.get(requestId);
    if (!pendingMessage) {
      return Promise.resolve();
    }
    runtime.pendingAssistantMessages.delete(requestId);
    const text = pendingMessage.text;

    return transcriptStore.appendRecord({
      cwd: workspaceRoot,
      sessionId: pendingMessage.sessionId,
      record: {
        timestamp: opts.timestamp,
        type: "assistant_message",
        payload: {
          requestId: pendingMessage.requestId,
          provider: pendingMessage.provider,
          model: pendingMessage.model,
          text,
          reasoningText: pendingMessage.reasoningText,
          status: opts.status,
          stopReason: opts.stopReason,
          error: opts.error,
        },
      },
    });
  }

  function emitChatError(runtime: ProviderRuntime, requestId: string, message: string): void {
    emitters.chatStream({
      requestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      kind: "error",
      text: message,
      timestamp: createTimestamp(),
    });
    void flushAssistantMessage(runtime, requestId, {
      timestamp: createTimestamp(),
      status: "error",
      error: message,
    });
  }

  function handleSessionUpdate(runtime: ProviderRuntime, params: ACPSessionUpdateParams): void {
    if (params.update.sessionUpdate === "available_commands_update") {
      const reported = parseAvailableCommands(
        (params.update as { availableCommands?: unknown }).availableCommands,
      );
      const commands = resolveProviderAvailableCommands(runtime.provider, reported);
      runtime.availableCommandsBySession.set(params.sessionId, commands);
      emitters.availableCommands({
        provider: runtime.provider,
        sessionId: params.sessionId,
        cwd: runtime.cwd,
        commands,
        timestamp: createTimestamp(),
      });
      return;
    }

    if (!runtime.activeRequestId || params.sessionId !== runtime.sessionId) {
      return;
    }
    if (params.update.sessionUpdate === "agent_message_chunk") {
      const text = extractChunkText(params.update);
      if (!text) {
        return;
      }
      const pendingMessage = runtime.pendingAssistantMessages.get(runtime.activeRequestId);
      if (pendingMessage) {
        pendingMessage.text = `${pendingMessage.text}${text}`;
      }
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "agent_chunk",
        text,
        timestamp: createTimestamp(),
      });
      return;
    }

    if (params.update.sessionUpdate === "agent_thought_chunk") {
      const text = extractChunkText(params.update);
      if (!text) {
        return;
      }
      const pendingMessage = runtime.pendingAssistantMessages.get(runtime.activeRequestId);
      if (pendingMessage) {
        pendingMessage.reasoningText = `${pendingMessage.reasoningText ?? ""}${text}`;
      }
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "agent_thought_chunk",
        text,
        timestamp: createTimestamp(),
      });
      return;
    }

    if (params.update.sessionUpdate === "tool_call") {
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "tool_call",
        toolCallId: String(
          (params.update as { toolCallId?: unknown }).toolCallId ?? crypto.randomUUID(),
        ),
        toolTitle:
          typeof (params.update as { title?: unknown }).title === "string"
            ? (params.update as { title?: string }).title
            : undefined,
        toolKind:
          typeof (params.update as { kind?: unknown }).kind === "string"
            ? (params.update as { kind?: string }).kind
            : undefined,
        toolState: extractToolState(
          typeof (params.update as { status?: unknown }).status === "string"
            ? (params.update as { status?: string }).status
            : undefined,
        ),
        input:
          (params.update as { rawInput?: unknown }).rawInput ??
          (params.update as { input?: unknown }).input,
        timestamp: createTimestamp(),
      });
      return;
    }

    if (params.update.sessionUpdate === "tool_call_update") {
      const rawOutput =
        (params.update as { rawOutput?: unknown }).rawOutput ??
        (params.update as { output?: unknown }).output;
      const toolState = extractToolState(
        typeof (params.update as { status?: unknown }).status === "string"
          ? (params.update as { status?: string }).status
          : undefined,
      );
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "tool_call_update",
        toolCallId: String(
          (params.update as { toolCallId?: unknown }).toolCallId ?? crypto.randomUUID(),
        ),
        toolTitle:
          typeof (params.update as { title?: unknown }).title === "string"
            ? (params.update as { title?: string }).title
            : undefined,
        toolKind:
          typeof (params.update as { kind?: unknown }).kind === "string"
            ? (params.update as { kind?: string }).kind
            : undefined,
        toolState,
        output: rawOutput,
        errorText: toolState === "output-error" ? extractToolErrorText(rawOutput) : undefined,
        timestamp: createTimestamp(),
      });
      return;
    }

    if (params.update.sessionUpdate === "usage_update") {
      const usage = extractUsage(params.update);
      if (!usage) {
        return;
      }
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "usage_update",
        used: usage.used,
        size: usage.size,
        modelId: usage.modelId ?? runtime.currentModel,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        cachedInputTokens: usage.cachedInputTokens,
        timestamp: createTimestamp(),
      });
      return;
    }

    const summary = summarizeSessionUpdate(params.update);
    if (!summary) {
      return;
    }

    emitters.chatStream({
      requestId: runtime.activeRequestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      kind: "reasoning_update",
      eventId: crypto.randomUUID(),
      updateType: params.update.sessionUpdate,
      summary,
      timestamp: createTimestamp(),
    });
  }

  function resolvePendingApprovals(
    runtime: ProviderRuntime,
    outcome: ACPRequestPermissionOutcome,
  ): void {
    const timestamp = createTimestamp();
    for (const pendingApproval of runtime.pendingApprovals.values()) {
      pendingApproval.resolve(outcome);
      emitters.approval({
        kind: "resolved",
        approvalId: pendingApproval.approvalId,
        provider: runtime.provider,
        sessionId: pendingApproval.sessionId,
        cwd: pendingApproval.cwd,
        requestId: pendingApproval.requestId,
        toolCallId: pendingApproval.toolCallId,
        outcome,
        timestamp,
      });
    }
    runtime.pendingApprovals.clear();
  }

  async function handlePermissionRequest(
    runtime: ProviderRuntime,
    params: ACPSessionRequestPermissionParams,
    requestId: ACPRequestId,
  ): Promise<ACPRequestPermissionOutcome> {
    const approvalId = String(requestId);
    const toolCallId = params.toolCall.toolCallId || approvalId;
    const timestamp = createTimestamp();

    emitters.approval({
      kind: "requested",
      approvalId,
      provider: runtime.provider,
      sessionId: params.sessionId,
      cwd: runtime.cwd,
      requestId: runtime.activeRequestId,
      toolCallId,
      toolKind: params.toolCall.kind ?? undefined,
      rawInput: stringifyRawInput(params.toolCall),
      locations: (params.toolCall.locations ?? []).map((location) => ({
        path: location.path,
        line: location.line ?? undefined,
      })),
      options: params.options.map((option) => ({
        optionId: option.optionId,
        name: option.name,
        kind: option.kind,
      })),
      timestamp,
    });

    return await new Promise<ACPRequestPermissionOutcome>((resolve) => {
      runtime.pendingApprovals.set(approvalId, {
        approvalId,
        sessionId: params.sessionId,
        cwd: runtime.cwd,
        requestId: runtime.activeRequestId,
        toolCallId,
        resolve,
      });
    });
  }

  async function createProviderRuntime(
    provider: SmokeProvider,
    cwd: string,
    runtimeOptions: CreateProviderRuntimeOptions = {},
  ): Promise<ProviderRuntime> {
    const smokeOptions = createSmokeRunnerOptions(provider, defaultPrompt, cwd);
    const rpcRequestMethods = new Map<string, string>();
    const createRuntimeSideEffects = () => ({
      onStderr: (chunk: string) => {
        const message = normalizeLogMessage(chunk);
        if (!message) {
          return;
        }
        const runtime = runtimes.get(provider);
        if (!runtime?.activeRequestId) {
          return;
        }
        emitChatError(runtime, runtime.activeRequestId, message);
      },
      onMessageSent: (
        message: unknown,
      ) => {
        if (isJsonRpcRequestLike(message as never)) {
          rpcRequestMethods.set(
            getRequestMapKey((message as { id: ACPRequestId }).id),
            (message as { method: string }).method,
          );
        }
        emitACPTranscript(
          provider,
          "outgoing",
          message,
          rpcRequestMethods,
          runtimes.get(provider)?.sessionId,
        );
      },
      onMessageReceived: (message: unknown) => {
        if (isJsonRpcRequestLike(message as never)) {
          rpcRequestMethods.set(
            getRequestMapKey((message as { id: ACPRequestId }).id),
            (message as { method: string }).method,
          );
        }
        emitACPTranscript(
          provider,
          "incoming",
          message,
          rpcRequestMethods,
          runtimes.get(provider)?.sessionId,
        );
        if (isJsonRpcResponse(message as never)) {
          rpcRequestMethods.delete(getRequestMapKey((message as { id: ACPRequestId }).id));
        }
      },
      onExit: (code: number | null, signal: NodeJS.Signals | null) => {
        const runtime = runtimes.get(provider);
        if (!runtime) {
          return;
        }
        runtimes.delete(provider);
        resolvePendingApprovals(runtime, { outcome: "cancelled" });
        if (!runtime.activeRequestId) {
          return;
        }
        emitChatError(
          runtime,
          runtime.activeRequestId,
          `Agent process exited unexpectedly (code=${String(code)}, signal=${signal ?? "none"}).`,
        );
        runtime.activeRequestId = undefined;
      },
    });

    const sideEffects = createRuntimeSideEffects();
    const client: ProviderRuntimeClientLike =
      provider === "codex"
        ? new CodexNativeClient({
            cwd: smokeOptions.cwd,
            workspaceRoot,
            currentModeId: "build",
            ...sideEffects,
          })
        : new ACPClient(
            new StdioACPTransport(smokeOptions.cmd, smokeOptions.args, {
              cwd: smokeOptions.cwd,
              onStderr: sideEffects.onStderr,
              onMessageSent: sideEffects.onMessageSent,
              onMessageReceived: (message) => {
                sideEffects.onMessageReceived(message);
              },
              onExit: sideEffects.onExit,
            }),
          );
    await client.connect();
    await client.initialize({
      protocolVersion: 1,
      clientCapabilities: { terminal: true },
      clientInfo: {
        name: "open-acp",
        title: "OpenACP",
        version: "0.1.0",
      },
    });
    const runtime: ProviderRuntime = {
      provider,
      cwd,
      client,
      transportKind: provider === "codex" ? "codex-native" : "acp",
      sessionId: "",
      pendingApprovals: new Map(),
      pendingAssistantMessages: new Map(),
      rpcRequestMethods,
      availableCommandsBySession: new Map(),
      providerSessionIdsBySession: new Map(),
    };
    let sessionId = "";
    if (!runtimeOptions.skipSessionCreation) {
      const session = await client.createSession({ cwd, mcpServers: [] });
      providerModelCatalogStore.recordDiscovery(
        provider,
        normalizeDiscoveredProviderModels(session),
        createTimestamp(),
      );
      sessionId = session.sessionId;
      runtime.sessionId = sessionId;
      applySessionMeta(runtime, sessionId, session);
      sessionReplay.writeMetadata({
        sessionId,
        provider,
        cwd,
        transport: runtime.transportKind,
        currentModeId: runtime.currentModeId,
        providerSessionId: runtime.providerSessionIdsBySession.get(sessionId),
      });
    }
    client.onSessionUpdate((params) => {
      handleSessionUpdate(runtime, params);
    });
    client.setPermissionRequestHandler(async (params) =>
      handlePermissionRequest(runtime, params, params.requestId),
    );
    return runtime;
  }

  async function ensureProviderRuntime(
    provider: SmokeProvider,
    cwd: string,
  ): Promise<ProviderRuntime> {
    const existing = runtimes.get(provider);
    if (existing && existing.cwd === cwd) {
      return existing;
    }
    if (existing) {
      runtimes.delete(provider);
      await existing.client.disconnect();
    }

    const runtime = await createProviderRuntime(provider, cwd);
    runtimes.set(provider, runtime);
    return runtime;
  }

  async function switchRuntimeSession(runtime: ProviderRuntime, sessionId: string): Promise<void> {
    if (runtime.sessionId === sessionId) {
      return;
    }
    const session = await runtime.client.loadSession({
      sessionId,
      cwd: runtime.cwd,
      mcpServers: [],
    });
    providerModelCatalogStore.recordDiscovery(
      runtime.provider,
      normalizeDiscoveredProviderModels(session),
      createTimestamp(),
    );
    runtime.sessionId = sessionId;
    runtime.currentModel = undefined;
    applySessionMeta(runtime, sessionId, session);
    sessionReplay.writeMetadata({
      sessionId,
      provider: runtime.provider,
      cwd: runtime.cwd,
      transport: runtime.transportKind,
      currentModeId: runtime.currentModeId,
      providerSessionId: runtime.providerSessionIdsBySession.get(sessionId),
    });
  }

  async function prepareRuntimeForModel(
    runtime: ProviderRuntime,
    model?: string,
    targetSessionId?: string,
  ): Promise<ProviderRuntime> {
    if (!model && runtime.currentModel) {
      runtime.activeRequestId = undefined;
      runtimes.delete(runtime.provider);
      await runtime.client.disconnect();
      const recreated = await createProviderRuntime(runtime.provider, runtime.cwd, {
        skipSessionCreation: Boolean(targetSessionId),
      });
      try {
        if (targetSessionId) {
          await switchRuntimeSession(recreated, targetSessionId);
        }
        runtimes.set(runtime.provider, recreated);
      } catch (error) {
        await recreated.client.disconnect();
        throw error;
      }
      return recreated;
    }

    if (!model) {
      return runtime;
    }
    if (runtime.currentModel === model) {
      return runtime;
    }

    await runtime.client.setModel({
      sessionId: runtime.sessionId,
      modelId: model,
    });
    runtime.currentModel = model;
    return runtime;
  }

  return {
    ensureProviderRuntime,
    switchRuntimeSession,
    prepareRuntimeForModel,
    flushAssistantMessage,
    emitChatError,
    resolvePendingApprovals,
    getRuntime: (provider) => runtimes.get(provider),
  };
}
