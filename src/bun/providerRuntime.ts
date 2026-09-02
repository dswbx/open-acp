import type {
  ACPSessionConfigOption,
  ACPSessionModeState,
  ACPRequestPermissionOutcome,
} from "../core/acp/ACPTypes.ts";
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
  ProviderApprovalRequest,
  ProviderConfigState,
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
  NormalizedSessionMode,
  PlanReviewDecision,
  PlanReviewEventPayload,
  SessionModeConfigEventPayload,
  SmokeProvider,
  UserInputEventPayload,
} from "../shared/AppRPC.ts";
import { normalizeDiscoveredProviderModels } from "./providerModelDiscovery.ts";
import {
  createSessionModeChangeInstruction,
  resolvePlanReviewOutcome,
  resolveSessionModeState,
  type ResolvedSessionModeState,
} from "./sessionModes.ts";
import { extractPlanReviewContent } from "../shared/planReview.ts";

export interface ProviderRuntime {
  provider: SmokeProvider;
  workspaceId?: string;
  cwd: string;
  adapter: ProviderAdapter;
  transportKind: "acp" | "codex-native";
  sessionId: string;
  currentModel?: string;
  currentModeId?: string;
  modeState: ResolvedSessionModeState;
  activeRequestId?: string;
  pendingApprovals: Map<string, PendingApproval>;
  pendingUserInputs: Map<string, PendingUserInput>;
  pendingPlanReviews: Map<string, PendingPlanReview>;
  pendingAssistantMessages: Map<string, PendingAssistantMessage>;
  toolCallRequestIds: Map<string, string>;
  rpcRequestMethods: Map<string, string>;
  availableCommandsBySession: Map<string, AvailableCommand[]>;
  providerSessionIdsBySession: Map<string, string>;
  sessionHandles: Map<string, ProviderSessionHandle>;
  latestStructuredPlanText?: string;
}

export interface CreateProviderRuntimeOptions {
  skipSessionCreation?: boolean;
  workspaceId?: string;
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

export interface PendingPlanReview {
  reviewId: string;
  sessionId: string;
  cwd: string;
  requestId?: string;
  toolCallId: string;
  options: ProviderApprovalRequest["options"];
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
  sessionModeConfig(payload: SessionModeConfigEventPayload): void;
  planReview(payload: PlanReviewEventPayload): void;
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

export function resolveToolEventRequestId(
  runtime: Pick<ProviderRuntime, "activeRequestId" | "toolCallRequestIds">,
  toolCallId: string,
): string | undefined {
  return runtime.toolCallRequestIds.get(toolCallId) ?? runtime.activeRequestId;
}

export function getProviderRuntimeKey(provider: SmokeProvider, workspaceId?: string): string {
  return `${workspaceId ?? "default"}:${provider}`;
}

export interface ProviderRuntimeManager {
  ensureProviderRuntime(
    provider: SmokeProvider,
    cwd: string,
    options?: CreateProviderRuntimeOptions,
  ): Promise<ProviderRuntime>;
  createRuntimeSession(runtime: ProviderRuntime): Promise<ProviderSessionHandle>;
  switchRuntimeSession(runtime: ProviderRuntime, sessionId: string): Promise<void>;
  prepareRuntimeForModel(
    runtime: ProviderRuntime,
    model?: string,
    targetSessionId?: string,
  ): Promise<ProviderRuntime>;
  getSessionModeConfig(runtime: ProviderRuntime): SessionModeConfigEventPayload["modeConfig"];
  setSessionMode(
    runtime: ProviderRuntime,
    mode: NormalizedSessionMode,
  ): Promise<SessionModeConfigEventPayload["modeConfig"]>;
  respondToPlanReview(
    runtime: ProviderRuntime,
    reviewId: string,
    decision: PlanReviewDecision,
  ): Promise<{ sessionId: string; cwd: string; respondedAt: string }>;
  flushAssistantMessage(
    runtime: ProviderRuntime,
    requestId: string,
    options: FlushAssistantMessageOptions,
  ): Promise<void>;
  emitChatError(
    runtime: ProviderRuntime,
    requestId: string,
    message: string,
    options?: { fatal?: boolean },
  ): void;
  resolvePendingApprovals(runtime: ProviderRuntime, outcome: ACPRequestPermissionOutcome): void;
  resolvePendingUserInputs(runtime: ProviderRuntime, outcome: ProviderUserInputOutcome): void;
  getRuntime(provider: SmokeProvider, workspaceId?: string): ProviderRuntime | undefined;
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
    case "cursor":
      return { ...shared, cmd: "agent", args: ["acp"], transportKind: "acp" };
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

  const runtimes = new Map<string, ProviderRuntime>();

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

  function providerConfigOptionsToACP(config: ProviderConfigState): ACPSessionConfigOption[] {
    return config.options.map((option) => ({
      id: option.id,
      name: option.name,
      description: option.description,
      category: option.category,
      type: option.type,
      currentValue: option.currentValue,
      options: option.options?.map((entry) => ({
        value: entry.value,
        name: entry.name,
        description: entry.description,
      })),
      _meta: option._meta,
    }));
  }

  function providerModesToACP(config: ProviderConfigState): ACPSessionModeState | undefined {
    if (config.mode.availableModes.length === 0 && !config.mode.currentModeId) {
      return undefined;
    }

    return {
      currentModeId: config.mode.currentModeId ?? "",
      availableModes: config.mode.availableModes.map((mode) => ({
        id: mode.rawModeId,
        name: mode.label,
        description: mode.description,
      })),
    };
  }

  function resolveModeStateForHandle(
    runtime: ProviderRuntime,
    handle: ProviderSessionHandle,
  ): ResolvedSessionModeState {
    return resolveSessionModeState({
      provider: runtime.provider,
      sessionId: handle.sessionId,
      cwd: handle.cwd,
      configOptions: providerConfigOptionsToACP(handle.config),
      modes: providerModesToACP(handle.config),
      previous: runtime.modeState,
    });
  }

  function applySessionHandle(runtime: ProviderRuntime, handle: ProviderSessionHandle): void {
    runtime.sessionHandles.set(handle.sessionId, handle);
    runtime.sessionId = handle.sessionId;
    runtime.currentModeId = handle.replay.currentModeId;
    runtime.modeState = resolveModeStateForHandle(runtime, handle);
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
      workspaceId: runtime.workspaceId,
      provider: runtime.provider,
      cwd: handle.cwd,
      model: runtime.currentModel,
      mode: runtime.modeState.publicState.normalizedMode,
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
      workspaceId: runtime.workspaceId,
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

  function emitChatError(
    runtime: ProviderRuntime,
    requestId: string,
    message: string,
    options: { fatal?: boolean } = {},
  ): void {
    const fatal = options.fatal ?? true;
    emitters.chatStream({
      requestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      workspaceId: runtime.workspaceId,
      cwd: runtime.cwd,
      kind: "error",
      text: message,
      fatal,
      timestamp: createTimestamp(),
    });
    if (!fatal) {
      return;
    }
    void flushAssistantMessage(runtime, requestId, {
      timestamp: createTimestamp(),
      status: "error",
      error: message,
    });
  }

  function emitSessionModeConfig(runtime: ProviderRuntime): void {
    emitters.sessionModeConfig({
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      workspaceId: runtime.workspaceId,
      cwd: runtime.cwd,
      modeConfig: getSessionModeConfig(runtime),
      timestamp: createTimestamp(),
    });
  }

  function extractPlanTextForReview(
    runtime: ProviderRuntime,
    fallbackRawInput?: string,
  ): { planText: string; source: "native_switch_mode" | "structured_plan" } {
    const activeRequestId = runtime.activeRequestId;
    const assistantText =
      activeRequestId == null
        ? undefined
        : runtime.pendingAssistantMessages.get(activeRequestId)?.text.trim();
    const extractedAssistantPlan = assistantText
      ? extractPlanReviewContent(assistantText)
      : undefined;
    if (extractedAssistantPlan) {
      return {
        planText: extractedAssistantPlan.planText,
        source: "native_switch_mode",
      };
    }

    if (runtime.latestStructuredPlanText) {
      return {
        planText: runtime.latestStructuredPlanText,
        source: "structured_plan",
      };
    }

    const trimmedRawInput = fallbackRawInput?.trim();
    if (trimmedRawInput) {
      return {
        planText: trimmedRawInput,
        source: "native_switch_mode",
      };
    }

    return {
      planText: "Plan review requested, but the provider did not stream any plan text.",
      source: "native_switch_mode",
    };
  }

  function emitPlanReviewRequested(
    runtime: ProviderRuntime,
    request: ProviderApprovalRequest,
  ): void {
    const extractedPlan = extractPlanTextForReview(runtime, request.rawInput);
    emitters.planReview({
      kind: "requested",
      reviewId: request.approvalId,
      provider: runtime.provider,
      sessionId: request.sessionId,
      workspaceId: runtime.workspaceId,
      cwd: runtime.cwd,
      requestId: runtime.activeRequestId,
      source: extractedPlan.source,
      canResumeGeneration: true,
      planText: extractedPlan.planText,
      timestamp: createTimestamp(),
    });
  }

  function applyRuntimeConfigEvent(
    runtime: ProviderRuntime,
    sessionId: string,
    config: ProviderConfigState,
    replay?: { currentModeId?: string },
  ): void {
    const handle = runtime.sessionHandles.get(sessionId);
    if (handle) {
      handle.config = config;
      handle.replay.currentModeId = replay?.currentModeId ?? config.mode.currentModeId;
    }
    runtime.currentModeId = replay?.currentModeId ?? config.mode.currentModeId;
    runtime.modeState = resolveSessionModeState({
      provider: runtime.provider,
      sessionId,
      cwd: runtime.cwd,
      configOptions: providerConfigOptionsToACP(config),
      modes: providerModesToACP(config),
      previous: runtime.modeState,
    });
    emitSessionModeConfig(runtime);
  }

  function handleApprovalRequest(runtime: ProviderRuntime, request: ProviderApprovalRequest): void {
    if (request.toolKind === "switch_mode") {
      runtime.pendingPlanReviews.set(request.approvalId, {
        reviewId: request.approvalId,
        sessionId: request.sessionId,
        cwd: runtime.cwd,
        requestId: runtime.activeRequestId,
        toolCallId: request.toolCallId,
        options: request.options,
      });
      emitPlanReviewRequested(runtime, request);
      return;
    }

    runtime.pendingApprovals.set(request.approvalId, {
      approvalId: request.approvalId,
      sessionId: request.sessionId,
      cwd: runtime.cwd,
      requestId: runtime.activeRequestId,
      toolCallId: request.toolCallId,
    });
    emitters.approval({
      kind: "requested",
      approvalId: request.approvalId,
      provider: runtime.provider,
      sessionId: request.sessionId,
      workspaceId: runtime.workspaceId,
      cwd: runtime.cwd,
      requestId: runtime.activeRequestId,
      toolCallId: request.toolCallId,
      toolKind: request.toolKind,
      rawInput: request.rawInput,
      locations: request.locations,
      options: request.options,
      timestamp: createTimestamp(),
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
        workspaceId: runtime.workspaceId,
        cwd: pendingApproval.cwd,
        requestId: pendingApproval.requestId,
        toolCallId: pendingApproval.toolCallId,
        outcome,
        timestamp,
      });
    }
    runtime.pendingApprovals.clear();

    for (const pendingPlanReview of runtime.pendingPlanReviews.values()) {
      emitters.planReview({
        kind: "resolved",
        reviewId: pendingPlanReview.reviewId,
        provider: runtime.provider,
        sessionId: pendingPlanReview.sessionId,
        workspaceId: runtime.workspaceId,
        cwd: pendingPlanReview.cwd,
        decision: outcome.outcome === "selected" ? "start_build" : "cancel",
        timestamp,
      });
    }
    runtime.pendingPlanReviews.clear();
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
        workspaceId: runtime.workspaceId,
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
        workspaceId: runtime.workspaceId,
        cwd: runtime.cwd,
        commands: event.commands,
        timestamp,
      });
      return;
    }

    if (event.type === "config") {
      applyRuntimeConfigEvent(runtime, event.sessionId, event.config, event.replay);
      if (runtime.sessionId) {
        sessionReplay.writeMetadata({
          sessionId: runtime.sessionId,
          workspaceId: runtime.workspaceId,
          provider: runtime.provider,
          cwd: runtime.cwd,
          model: runtime.currentModel,
          mode: runtime.modeState.publicState.normalizedMode,
          transport: runtime.transportKind,
          currentModeId: runtime.currentModeId,
          providerSessionId: runtime.providerSessionIdsBySession.get(runtime.sessionId),
        });
      }
      return;
    }

    if (eventSessionId !== undefined && eventSessionId !== runtime.sessionId) {
      return;
    }

    if (event.type === "tool_call") {
      const requestId = runtime.activeRequestId;
      if (!requestId) {
        return;
      }
      runtime.toolCallRequestIds.set(event.tool.toolCallId, requestId);
      emitters.chatStream({
        requestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        workspaceId: runtime.workspaceId,
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
      const requestId = resolveToolEventRequestId(runtime, event.tool.toolCallId);
      if (!requestId) {
        return;
      }
      emitters.chatStream({
        requestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        workspaceId: runtime.workspaceId,
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

    if (!runtime.activeRequestId) {
      if (event.type === "approval_request") {
        handleApprovalRequest(runtime, event.request);
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
          workspaceId: runtime.workspaceId,
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
        workspaceId: runtime.workspaceId,
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
        workspaceId: runtime.workspaceId,
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
        runtime.latestStructuredPlanText = `${runtime.latestStructuredPlanText ?? ""}${text}`;
        const pendingMessage = runtime.pendingAssistantMessages.get(runtime.activeRequestId);
        if (pendingMessage) {
          pendingMessage.reasoningText = `${pendingMessage.reasoningText ?? ""}${text}`;
        }
        emitters.chatStream({
          requestId: runtime.activeRequestId,
          provider: runtime.provider,
          sessionId: runtime.sessionId,
          workspaceId: runtime.workspaceId,
          cwd: runtime.cwd,
          kind: "agent_thought_chunk",
          text,
          timestamp,
        });
      }
      return;
    }

    if (event.type === "usage") {
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        workspaceId: runtime.workspaceId,
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

    if (event.type === "session_info") {
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: event.sessionId,
        workspaceId: runtime.workspaceId,
        cwd: runtime.cwd,
        kind: "session_info_update",
        title: event.title,
        updatedAt: event.updatedAt,
        timestamp,
      });
      return;
    }

    if (event.type === "reasoning") {
      emitters.chatStream({
        requestId: runtime.activeRequestId,
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        workspaceId: runtime.workspaceId,
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

    if (event.type === "approval_request") {
      handleApprovalRequest(runtime, event.request);
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
      workspaceId: runtime.workspaceId,
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
    workspaceId?: string,
  ): ProviderAdapter {
    const smokeOptions = createSmokeRunnerOptions(provider, defaultPrompt, cwd);
    const runtimeKey = getProviderRuntimeKey(provider, workspaceId);
    const diagnostics = {
      onStderr: (chunk: string) => {
        const message = normalizeLogMessage(chunk);
        if (!message) {
          return;
        }
        const runtime = runtimes.get(runtimeKey);
        if (!runtime?.activeRequestId) {
          return;
        }
        emitChatError(runtime, runtime.activeRequestId, message, { fatal: false });
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
          runtimes.get(runtimeKey)?.sessionId,
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
          runtimes.get(runtimeKey)?.sessionId,
        );
        if (isJsonRpcResponse(transcriptMessage as never)) {
          requestMethods.delete(
            getRequestMapKey((transcriptMessage as { id: string | number | null }).id),
          );
        }
      },
      onExit: (code: number | null, signal: NodeJS.Signals | null) => {
        const runtime = runtimes.get(runtimeKey);
        if (!runtime) {
          return;
        }
        runtimes.delete(runtimeKey);
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
    const adapter = buildAdapter(provider, cwd, rpcRequestMethods, runtimeOptions.workspaceId);
    await adapter.connect();
    await adapter.initialize({
      protocolVersion: 1,
      clientCapabilities: { terminal: true },
      clientInfo: OPENACP_CLIENT_INFO,
    });

    const runtime: ProviderRuntime = {
      provider,
      workspaceId: runtimeOptions.workspaceId,
      cwd,
      adapter,
      transportKind: adapter.transportKind,
      sessionId: "",
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      pendingPlanReviews: new Map(),
      pendingAssistantMessages: new Map(),
      toolCallRequestIds: new Map(),
      rpcRequestMethods,
      availableCommandsBySession: new Map(),
      modeState: resolveSessionModeState({
        provider,
        sessionId: "",
        cwd,
      }),
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
    runtimeOptions: CreateProviderRuntimeOptions = {},
  ): Promise<ProviderRuntime> {
    const runtimeKey = getProviderRuntimeKey(provider, runtimeOptions.workspaceId);
    const existing = runtimes.get(runtimeKey);
    if (existing && existing.cwd === cwd) {
      return existing;
    }
    if (existing) {
      runtimes.delete(runtimeKey);
      await existing.adapter.disconnect();
    }

    const runtime = await createProviderRuntime(provider, cwd, runtimeOptions);
    runtimes.set(runtimeKey, runtime);
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
      const runtimeKey = getProviderRuntimeKey(runtime.provider, runtime.workspaceId);
      runtimes.delete(runtimeKey);
      await runtime.adapter.disconnect();
      const recreated = await createProviderRuntime(runtime.provider, runtime.cwd, {
        skipSessionCreation: Boolean(targetSessionId),
        workspaceId: runtime.workspaceId,
      });
      try {
        if (targetSessionId) {
          await switchRuntimeSession(recreated, targetSessionId);
        }
        runtimes.set(runtimeKey, recreated);
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

  function getSessionModeConfig(
    runtime: ProviderRuntime,
  ): SessionModeConfigEventPayload["modeConfig"] {
    return {
      ...runtime.modeState.publicState,
      workspaceId: runtime.workspaceId,
    };
  }

  async function setSessionMode(
    runtime: ProviderRuntime,
    mode: NormalizedSessionMode,
  ): Promise<SessionModeConfigEventPayload["modeConfig"]> {
    const instruction = createSessionModeChangeInstruction(runtime.modeState, mode);
    if (instruction.kind === "unsupported") {
      throw new Error(instruction.reason);
    }
    if (instruction.kind === "noop") {
      return getSessionModeConfig(runtime);
    }

    if (instruction.kind === "set_config_option") {
      const handle = await runtime.adapter.setConfigOption({
        sessionId: runtime.sessionId,
        optionId: instruction.configId,
        value: instruction.value,
      });
      if (handle) {
        applySessionHandle(runtime, handle);
      }
      emitSessionModeConfig(runtime);
      sessionReplay.writeMetadata({
        sessionId: runtime.sessionId,
        workspaceId: runtime.workspaceId,
        provider: runtime.provider,
        cwd: runtime.cwd,
        model: runtime.currentModel,
        mode: runtime.modeState.publicState.normalizedMode,
        transport: runtime.transportKind,
        currentModeId: runtime.currentModeId,
        providerSessionId: runtime.providerSessionIdsBySession.get(runtime.sessionId),
      });
      return getSessionModeConfig(runtime);
    }

    const handle = await runtime.adapter.setMode({
      sessionId: runtime.sessionId,
      modeId: instruction.modeId,
    });
    if (handle) {
      applySessionHandle(runtime, handle);
    }
    sessionReplay.writeMetadata({
      sessionId: runtime.sessionId,
      workspaceId: runtime.workspaceId,
      provider: runtime.provider,
      cwd: runtime.cwd,
      model: runtime.currentModel,
      mode: runtime.modeState.publicState.normalizedMode,
      transport: runtime.transportKind,
      currentModeId: runtime.currentModeId,
      providerSessionId: runtime.providerSessionIdsBySession.get(runtime.sessionId),
    });
    emitSessionModeConfig(runtime);
    return getSessionModeConfig(runtime);
  }

  async function respondToPlanReview(
    runtime: ProviderRuntime,
    reviewId: string,
    decision: PlanReviewDecision,
  ): Promise<{ sessionId: string; cwd: string; respondedAt: string }> {
    const pendingPlanReview = runtime.pendingPlanReviews.get(reviewId);
    if (!pendingPlanReview) {
      throw new Error(`Unknown plan review request: ${reviewId}`);
    }

    runtime.pendingPlanReviews.delete(reviewId);
    await runtime.adapter.respondToApproval(
      reviewId,
      resolvePlanReviewOutcome(decision, pendingPlanReview.options),
    );
    const respondedAt = createTimestamp();
    emitters.planReview({
      kind: "resolved",
      reviewId,
      provider: runtime.provider,
      sessionId: pendingPlanReview.sessionId,
      workspaceId: runtime.workspaceId,
      cwd: pendingPlanReview.cwd,
      decision,
      timestamp: respondedAt,
    });

    return {
      sessionId: pendingPlanReview.sessionId,
      cwd: pendingPlanReview.cwd,
      respondedAt,
    };
  }

  return {
    ensureProviderRuntime,
    createRuntimeSession,
    switchRuntimeSession,
    prepareRuntimeForModel,
    getSessionModeConfig,
    setSessionMode,
    respondToPlanReview,
    flushAssistantMessage,
    emitChatError,
    resolvePendingApprovals,
    resolvePendingUserInputs,
    getRuntime: (provider, workspaceId) =>
      runtimes.get(getProviderRuntimeKey(provider, workspaceId)),
  };
}
