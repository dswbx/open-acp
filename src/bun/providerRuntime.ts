import type { ACPRequestPermissionOutcome } from "../core/acp/ACPTypes.ts";
import type { RealAgentSmokeOptions } from "../cli/RealAgentSmoke.ts";
import {
  extractToolState,
  getRequestMapKey,
  isJsonRpcNotificationLike,
  isJsonRpcRequestLike,
  isJsonRpcResponse,
  normalizeLogMessage,
} from "./acpHelpers.ts";
import { createTimestamp, type SessionReplayRecorder } from "./sessionReplay.ts";
import type { SessionTranscriptStore } from "./SessionTranscriptStore.ts";
import type { createProviderModelCatalogStore } from "./providerModelCatalogStore.ts";
import { CodexNativeClient } from "./providers/codexNative/CodexNativeClient.ts";
import { ACPProviderAdapter } from "./providers/ACPProviderAdapter.ts";
import { CodexProviderAdapter } from "./providers/CodexProviderAdapter.ts";
import { OPENACP_CLIENT_INFO } from "../shared/appVersion.ts";
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderSessionHandle,
  ProviderUserInputOutcome,
} from "./providers/providerContract.ts";
import type {
  AgentTranscriptEventPayload,
  ApprovalEventPayload,
  AvailableCommand,
  AvailableCommandsEventPayload,
  ChatStreamEventPayload,
  SmokeProvider,
  UserInputEventPayload,
} from "../shared/AppRPC.ts";
import { normalizeDiscoveredProviderModels } from "./providerModelDiscovery.ts";

export interface ProviderRuntime {
  provider: SmokeProvider;
  cwd: string;
  adapter: ProviderAdapter;
  transportKind: "acp" | "codex-native";
  sessionId: string;
  currentModel?: string;
  currentModeId?: string;
  activeRequestId?: string;
  pendingApprovals: Map<string, PendingApproval>;
  pendingUserInputs: Map<string, PendingUserInput>;
  pendingAssistantMessages: Map<string, PendingAssistantMessage>;
  rpcRequestMethods: Map<string, string>;
  availableCommandsBySession: Map<string, AvailableCommand[]>;
  providerSessionIdsBySession: Map<string, string>;
  sessionHandles: Map<string, ProviderSessionHandle>;
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
}

export interface PendingUserInput {
  inputId: string;
  sessionId: string;
  cwd: string;
  requestId?: string;
  fields: Extract<UserInputEventPayload, { kind: "requested" }>["fields"];
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
  userInput(payload: UserInputEventPayload): void;
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
  createRuntimeSession(runtime: ProviderRuntime): Promise<ProviderSessionHandle>;
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
  resolvePendingUserInputs(runtime: ProviderRuntime, outcome: ProviderUserInputOutcome): void;
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

  function emitProtocolTranscript(
    provider: SmokeProvider,
    direction: AgentTranscriptEventPayload["direction"],
    message: unknown,
    requestMethods: Map<string, string>,
    fallbackSessionId?: string,
  ): void {
    const record = typeof message === "object" && message !== null ? message : {};
    let kind: AgentTranscriptEventPayload["kind"];
    let method: string | undefined;
    let requestId: string | number | null | undefined;

    if (isJsonRpcRequestLike(record as never)) {
      kind = "request";
      method = (record as { method: string }).method;
      requestId = (record as { id: string | number | null }).id;
    } else if (isJsonRpcNotificationLike(record as never)) {
      kind = "notification";
      method = (record as { method: string }).method;
    } else {
      kind = "response";
      requestId =
        typeof (record as { id?: unknown }).id === "string" ||
        typeof (record as { id?: unknown }).id === "number" ||
        (record as { id?: unknown }).id === null
          ? ((record as { id?: string | number | null }).id ?? undefined)
          : undefined;
      method =
        requestId === undefined ? undefined : requestMethods.get(getRequestMapKey(requestId));
    }

    const inferredSessionId =
      typeof (record as { params?: { sessionId?: unknown } }).params?.sessionId === "string"
        ? ((record as { params: { sessionId: string } }).params.sessionId ?? fallbackSessionId)
        : typeof (record as { result?: { sessionId?: unknown } }).result?.sessionId === "string"
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

  function normalizeTranscriptMessage(provider: SmokeProvider, message: unknown): unknown {
    if (
      provider !== "codex" ||
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message) ||
      "jsonrpc" in message
    ) {
      return message;
    }

    return {
      jsonrpc: "2.0",
      ...(message as Record<string, unknown>),
    };
  }

  function applySessionHandle(runtime: ProviderRuntime, handle: ProviderSessionHandle): void {
    runtime.sessionHandles.set(handle.sessionId, handle);
    runtime.sessionId = handle.sessionId;
    runtime.currentModeId = handle.replay.currentModeId;
    if (handle.replay.providerSessionId) {
      runtime.providerSessionIdsBySession.set(handle.sessionId, handle.replay.providerSessionId);
    }
  }

  function recordSessionDiscovery(runtime: ProviderRuntime, handle: ProviderSessionHandle): void {
    providerModelCatalogStore.recordDiscovery(
      runtime.provider,
      normalizeDiscoveredProviderModels(handle),
      createTimestamp(),
    );
    sessionReplay.writeMetadata({
      sessionId: handle.sessionId,
      provider: runtime.provider,
      cwd: handle.cwd,
      model: runtime.currentModel,
      transport: runtime.transportKind,
      currentModeId: handle.replay.currentModeId,
      providerSessionId: handle.replay.providerSessionId,
    });
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
          text: pendingMessage.text,
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

  function resolvePendingApprovals(
    runtime: ProviderRuntime,
    outcome: ACPRequestPermissionOutcome,
  ): void {
    const timestamp = createTimestamp();
    for (const pendingApproval of runtime.pendingApprovals.values()) {
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

  function resolvePendingUserInputs(
    runtime: ProviderRuntime,
    outcome: ProviderUserInputOutcome,
  ): void {
    const timestamp = createTimestamp();
    for (const pendingInput of runtime.pendingUserInputs.values()) {
      emitters.userInput({
        kind: "resolved",
        inputId: pendingInput.inputId,
        provider: runtime.provider,
        sessionId: pendingInput.sessionId,
        cwd: pendingInput.cwd,
        requestId: pendingInput.requestId,
        outcome,
        timestamp,
      });
    }
    runtime.pendingUserInputs.clear();
  }

  function handleAdapterEvent(runtime: ProviderRuntime, event: ProviderEvent): void {
    const timestamp = createTimestamp();
    const eventSessionId =
      "sessionId" in event
        ? event.sessionId
        : "request" in event
          ? event.request.sessionId
          : undefined;
    if (event.type === "available_commands") {
      runtime.availableCommandsBySession.set(event.sessionId, event.commands);
      emitters.availableCommands({
        provider: runtime.provider,
        sessionId: event.sessionId,
        cwd: runtime.cwd,
        commands: event.commands,
        timestamp,
      });
      return;
    }

    if (!runtime.activeRequestId || eventSessionId !== runtime.sessionId) {
      if (event.type === "config") {
        runtime.currentModeId = event.replay?.currentModeId ?? event.config.mode.currentModeId;
      } else if (event.type === "approval_request") {
        runtime.pendingApprovals.set(event.request.approvalId, {
          approvalId: event.request.approvalId,
          sessionId: event.request.sessionId,
          cwd: runtime.cwd,
          requestId: runtime.activeRequestId,
          toolCallId: event.request.toolCallId,
        });
        emitters.approval({
          kind: "requested",
          approvalId: event.request.approvalId,
          provider: runtime.provider,
          sessionId: event.request.sessionId,
          cwd: runtime.cwd,
          requestId: runtime.activeRequestId,
          toolCallId: event.request.toolCallId,
          toolKind: event.request.toolKind,
          rawInput: event.request.rawInput,
          locations: event.request.locations,
          options: event.request.options,
          timestamp,
        });
      } else if (event.type === "user_input_request") {
        runtime.pendingUserInputs.set(event.request.inputId, {
          inputId: event.request.inputId,
          sessionId: event.request.sessionId,
          cwd: runtime.cwd,
          requestId: runtime.activeRequestId,
          fields: event.request.fields,
        });
        emitters.userInput({
          kind: "requested",
          inputId: event.request.inputId,
          provider: runtime.provider,
          sessionId: event.request.sessionId,
          cwd: runtime.cwd,
          requestId: runtime.activeRequestId,
          fields: event.request.fields,
          timestamp,
        });
      }
      return;
    }

    if (event.type === "message_chunk") {
      const pendingMessage = runtime.pendingAssistantMessages.get(runtime.activeRequestId);
      if (pendingMessage) {
        pendingMessage.text = `${pendingMessage.text}${event.text}`;
      }
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "agent_chunk",
        text: event.text,
        timestamp,
      });
      return;
    }

    if (event.type === "thought_chunk") {
      const pendingMessage = runtime.pendingAssistantMessages.get(runtime.activeRequestId);
      if (pendingMessage) {
        pendingMessage.reasoningText = `${pendingMessage.reasoningText ?? ""}${event.text}`;
      }
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "agent_thought_chunk",
        text: event.text,
        timestamp,
      });
      return;
    }

    if (event.type === "plan_update") {
      const text = event.plan.textDelta ?? event.plan.detail ?? event.plan.summary;
      if (text) {
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
          timestamp,
        });
      }
      return;
    }

    if (event.type === "tool_call") {
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "tool_call",
        toolCallId: event.tool.toolCallId,
        toolTitle: event.tool.title,
        toolKind: event.tool.kind,
        toolState: extractToolState(event.tool.status),
        input: event.tool.input,
        timestamp,
      });
      return;
    }

    if (event.type === "tool_call_update") {
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "tool_call_update",
        toolCallId: event.tool.toolCallId,
        toolTitle: event.tool.title,
        toolKind: event.tool.kind,
        toolState: extractToolState(event.tool.status),
        output: event.tool.output,
        errorText: event.tool.errorText,
        timestamp,
      });
      return;
    }

    if (event.type === "usage") {
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "usage_update",
        used: event.usage.used,
        size: event.usage.size,
        modelId: event.usage.modelId ?? runtime.currentModel,
        inputTokens: event.usage.inputTokens,
        outputTokens: event.usage.outputTokens,
        reasoningTokens: event.usage.reasoningTokens,
        cachedInputTokens: event.usage.cachedInputTokens,
        timestamp,
      });
      return;
    }

    if (event.type === "reasoning") {
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        kind: "reasoning_update",
        eventId: crypto.randomUUID(),
        updateType: event.updateType,
        summary: event.summary,
        detail: event.detail,
        timestamp,
      });
      return;
    }

    if (event.type === "config") {
      runtime.currentModeId = event.replay?.currentModeId ?? event.config.mode.currentModeId;
      sessionReplay.writeMetadata({
        sessionId: runtime.sessionId,
        provider: runtime.provider,
        cwd: runtime.cwd,
        model: runtime.currentModel,
        transport: runtime.transportKind,
        currentModeId: runtime.currentModeId,
        providerSessionId: runtime.providerSessionIdsBySession.get(runtime.sessionId),
      });
      return;
    }

    if (event.type === "approval_request") {
      runtime.pendingApprovals.set(event.request.approvalId, {
        approvalId: event.request.approvalId,
        sessionId: event.request.sessionId,
        cwd: runtime.cwd,
        requestId: runtime.activeRequestId,
        toolCallId: event.request.toolCallId,
      });
      emitters.approval({
        kind: "requested",
        approvalId: event.request.approvalId,
        provider: runtime.provider,
        sessionId: event.request.sessionId,
        cwd: runtime.cwd,
        requestId: runtime.activeRequestId,
        toolCallId: event.request.toolCallId,
        toolKind: event.request.toolKind,
        rawInput: event.request.rawInput,
        locations: event.request.locations,
        options: event.request.options,
        timestamp,
      });
      return;
    }

    runtime.pendingUserInputs.set(event.request.inputId, {
      inputId: event.request.inputId,
      sessionId: event.request.sessionId,
      cwd: runtime.cwd,
      requestId: runtime.activeRequestId,
      fields: event.request.fields,
    });
    emitters.userInput({
      kind: "requested",
      inputId: event.request.inputId,
      provider: runtime.provider,
      sessionId: event.request.sessionId,
      cwd: runtime.cwd,
      requestId: runtime.activeRequestId,
      fields: event.request.fields,
      timestamp,
    });
  }

  function buildAdapter(
    provider: SmokeProvider,
    cwd: string,
    requestMethods: Map<string, string>,
  ): ProviderAdapter {
    const smokeOptions = createSmokeRunnerOptions(provider, defaultPrompt, cwd);
    const diagnostics = {
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
      onMessageSent: (message: unknown) => {
        const transcriptMessage = normalizeTranscriptMessage(provider, message);
        if (isJsonRpcRequestLike(transcriptMessage as never)) {
          requestMethods.set(
            getRequestMapKey((transcriptMessage as { id: string | number | null }).id),
            (transcriptMessage as { method: string }).method,
          );
        }
        emitProtocolTranscript(
          provider,
          "outgoing",
          transcriptMessage,
          requestMethods,
          runtimes.get(provider)?.sessionId,
        );
      },
      onMessageReceived: (message: unknown) => {
        const transcriptMessage = normalizeTranscriptMessage(provider, message);
        if (isJsonRpcRequestLike(transcriptMessage as never)) {
          requestMethods.set(
            getRequestMapKey((transcriptMessage as { id: string | number | null }).id),
            (transcriptMessage as { method: string }).method,
          );
        }
        emitProtocolTranscript(
          provider,
          "incoming",
          transcriptMessage,
          requestMethods,
          runtimes.get(provider)?.sessionId,
        );
        if (isJsonRpcResponse(transcriptMessage as never)) {
          requestMethods.delete(
            getRequestMapKey((transcriptMessage as { id: string | number | null }).id),
          );
        }
      },
      onExit: (code: number | null, signal: NodeJS.Signals | null) => {
        const runtime = runtimes.get(provider);
        if (!runtime) {
          return;
        }
        runtimes.delete(provider);
        resolvePendingApprovals(runtime, { outcome: "cancelled" });
        resolvePendingUserInputs(runtime, { outcome: "cancelled" });
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
    };

    if (provider === "codex") {
      return new CodexProviderAdapter(
        provider,
        new CodexNativeClient({
          cwd,
          workspaceRoot,
          currentModeId: "build",
          ...diagnostics,
        }),
      );
    }

    return new ACPProviderAdapter({
      provider,
      command: smokeOptions.cmd,
      args: smokeOptions.args,
      cwd,
      diagnostics,
    });
  }

  async function createProviderRuntime(
    provider: SmokeProvider,
    cwd: string,
    runtimeOptions: CreateProviderRuntimeOptions = {},
  ): Promise<ProviderRuntime> {
    const rpcRequestMethods = new Map<string, string>();
    const adapter = buildAdapter(provider, cwd, rpcRequestMethods);
    await adapter.connect();
    await adapter.initialize({
      protocolVersion: 1,
      clientCapabilities: { terminal: true },
      clientInfo: OPENACP_CLIENT_INFO,
    });

    const runtime: ProviderRuntime = {
      provider,
      cwd,
      adapter,
      transportKind: adapter.transportKind,
      sessionId: "",
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      pendingAssistantMessages: new Map(),
      rpcRequestMethods,
      availableCommandsBySession: new Map(),
      providerSessionIdsBySession: new Map(),
      sessionHandles: new Map(),
    };

    adapter.subscribe((event) => {
      handleAdapterEvent(runtime, event);
    });

    if (!runtimeOptions.skipSessionCreation) {
      const handle = await adapter.createSession({ cwd, mcpServers: [] });
      applySessionHandle(runtime, handle);
      recordSessionDiscovery(runtime, handle);
    }

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
      await existing.adapter.disconnect();
    }

    const runtime = await createProviderRuntime(provider, cwd);
    runtimes.set(provider, runtime);
    return runtime;
  }

  async function createRuntimeSession(runtime: ProviderRuntime): Promise<ProviderSessionHandle> {
    const handle = await runtime.adapter.createSession({
      cwd: runtime.cwd,
      mcpServers: [],
    });
    applySessionHandle(runtime, handle);
    runtime.currentModel = undefined;
    recordSessionDiscovery(runtime, handle);
    return handle;
  }

  async function switchRuntimeSession(runtime: ProviderRuntime, sessionId: string): Promise<void> {
    if (runtime.sessionId === sessionId) {
      return;
    }
    const handle = await runtime.adapter.loadSession({
      sessionId,
      cwd: runtime.cwd,
      mcpServers: [],
    });
    applySessionHandle(runtime, handle);
    runtime.currentModel = undefined;
    recordSessionDiscovery(runtime, handle);
  }

  async function prepareRuntimeForModel(
    runtime: ProviderRuntime,
    model?: string,
    targetSessionId?: string,
  ): Promise<ProviderRuntime> {
    if (!model && runtime.currentModel) {
      runtime.activeRequestId = undefined;
      runtimes.delete(runtime.provider);
      await runtime.adapter.disconnect();
      const recreated = await createProviderRuntime(runtime.provider, runtime.cwd, {
        skipSessionCreation: Boolean(targetSessionId),
      });
      try {
        if (targetSessionId) {
          await switchRuntimeSession(recreated, targetSessionId);
        }
        runtimes.set(runtime.provider, recreated);
      } catch (error) {
        await recreated.adapter.disconnect();
        throw error;
      }
      return recreated;
    }

    if (!model || runtime.currentModel === model) {
      return runtime;
    }

    await runtime.adapter.setConfigOption({
      sessionId: runtime.sessionId,
      optionId: "model",
      value: model,
    });
    runtime.currentModel = model;
    return runtime;
  }

  return {
    ensureProviderRuntime,
    createRuntimeSession,
    switchRuntimeSession,
    prepareRuntimeForModel,
    flushAssistantMessage,
    emitChatError,
    resolvePendingApprovals,
    resolvePendingUserInputs,
    getRuntime: (provider) => runtimes.get(provider),
  };
}
