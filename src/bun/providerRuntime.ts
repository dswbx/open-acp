import { ACPClient } from "../core/acp/ACPClient.ts";
import { StdioACPTransport } from "../core/acp/StdioACPTransport.ts";
import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse,
  ACPRequestId,
  ACPRequestPermissionOutcome,
  ACPSessionConfigOptionUpdate,
  ACPSessionCurrentModeUpdate,
  ACPSessionPlanUpdate,
  ACPSessionRequestPermissionParams,
  ACPSessionSetConfigOptionParams,
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
  NormalizedSessionMode,
  PlanReviewDecision,
  PlanReviewEventPayload,
  SessionModeConfigEventPayload,
  SmokeProvider,
} from "../shared/AppRPC.ts";
import type { RealAgentSmokeOptions } from "../cli/RealAgentSmoke.ts";
import {
  extractChunkText,
  extractToolErrorText,
  extractToolState,
  extractUsage,
  getRequestMapKey,
  inferSessionIdFromMessage,
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
import {
  createSessionModeChangeInstruction,
  resolvePlanReviewOutcome,
  resolveSessionModeState,
  type ResolvedSessionModeState,
} from "./sessionModes.ts";
import { extractPlanReviewContent, formatStructuredPlanEntries } from "../shared/planReview.ts";

export interface ProviderRuntime {
  provider: SmokeProvider;
  cwd: string;
  transport: StdioACPTransport;
  client: ACPClient;
  sessionId: string;
  currentModel?: string;
  modeState: ResolvedSessionModeState;
  activeRequestId?: string;
  pendingApprovals: Map<string, PendingApproval>;
  pendingPlanReviews: Map<string, PendingPlanReview>;
  pendingAssistantMessages: Map<string, PendingAssistantMessage>;
  rpcRequestMethods: Map<string, string>;
  availableCommandsBySession: Map<string, AvailableCommand[]>;
  latestStructuredPlanText?: string;
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

export interface PendingPlanReview {
  reviewId: string;
  sessionId: string;
  cwd: string;
  requestId?: string;
  toolCallId: string;
  options: ACPSessionRequestPermissionParams["options"];
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

export interface ProviderRuntimeManager {
  ensureProviderRuntime(provider: SmokeProvider, cwd: string): Promise<ProviderRuntime>;
  adoptSessionSetup(
    runtime: ProviderRuntime,
    sessionId: string,
    setup: {
      configOptions?: ResolvedSessionModeState["rawConfigOptions"] | null;
      modes?: ResolvedSessionModeState["rawModes"] | null;
    },
  ): void;
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
  emitChatError(runtime: ProviderRuntime, requestId: string, message: string): void;
  resolvePendingApprovals(runtime: ProviderRuntime, outcome: ACPRequestPermissionOutcome): void;
  getRuntime(provider: SmokeProvider): ProviderRuntime | undefined;
}

export function createSmokeRunnerOptions(
  provider: SmokeProvider,
  prompt: string,
  cwd: string,
): RealAgentSmokeOptions {
  const shared = { cwd, prompt, protocolVersion: 1 };
  switch (provider) {
    case "codex":
      return { ...shared, cmd: "npx", args: ["-y", "@zed-industries/codex-acp"] };
    case "claude":
      return { ...shared, cmd: "npx", args: ["-y", "@agentclientprotocol/claude-agent-acp"] };
    case "qwen":
      return { ...shared, cmd: "npx", args: ["-y", "@qwen-code/qwen-code", "--acp"] };
    case "opencode":
      return { ...shared, cmd: "opencode", args: ["acp"] };
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
    message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
    requestMethods: Map<string, string>,
    fallbackSessionId?: string,
  ): void {
    let kind: AgentTranscriptEventPayload["kind"];
    let method: string | undefined;
    let requestId: ACPRequestId | undefined;

    if (isJsonRpcRequestLike(message)) {
      kind = "request";
      method = message.method;
      requestId = message.id;
    } else if (isJsonRpcNotificationLike(message)) {
      kind = "notification";
      method = message.method;
    } else {
      kind = "response";
      requestId = message.id;
      method =
        requestId === undefined ? undefined : requestMethods.get(getRequestMapKey(requestId));
    }

    emitters.agentTranscript({
      entryId: crypto.randomUUID(),
      provider,
      sessionId: inferSessionIdFromMessage(message, fallbackSessionId),
      direction,
      kind,
      method,
      requestId,
      summary: kind === "response" ? `${method ?? "rpc"} response` : (method ?? kind),
      json: JSON.stringify(message, null, 2),
      timestamp: createTimestamp(),
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

  function emitSessionModeConfig(runtime: ProviderRuntime): void {
    emitters.sessionModeConfig({
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      modeConfig: runtime.modeState.publicState,
      timestamp: createTimestamp(),
    });
  }

  function applyRuntimeSessionSetup(
    runtime: ProviderRuntime,
    params: {
      sessionId: string;
      configOptions?: ResolvedSessionModeState["rawConfigOptions"] | null;
      modes?: ResolvedSessionModeState["rawModes"] | null;
    },
  ): void {
    runtime.sessionId = params.sessionId;
    runtime.modeState = resolveSessionModeState({
      provider: runtime.provider,
      sessionId: params.sessionId,
      cwd: runtime.cwd,
      configOptions: params.configOptions,
      modes: params.modes,
      previous: runtime.modeState,
    });
  }

  function updateRuntimeConfigOptions(
    runtime: ProviderRuntime,
    configOptions: ACPSessionConfigOptionUpdate["configOptions"],
  ): void {
    runtime.modeState = resolveSessionModeState({
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      configOptions,
      previous: runtime.modeState,
    });
    emitSessionModeConfig(runtime);
  }

  function updateRuntimeCurrentMode(
    runtime: ProviderRuntime,
    currentModeId: ACPSessionCurrentModeUpdate["currentModeId"],
  ): void {
    const rawModes = runtime.modeState.rawModes
      ? {
          ...runtime.modeState.rawModes,
          currentModeId,
        }
      : {
          currentModeId,
          availableModes: runtime.modeState.publicState.providerModes.map((mode) => ({
            id: mode.id,
            name: mode.name,
            description: mode.description,
          })),
        };
    runtime.modeState = resolveSessionModeState({
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      modes: rawModes,
      previous: runtime.modeState,
    });
    emitSessionModeConfig(runtime);
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
    params: ACPSessionRequestPermissionParams,
    reviewId: string,
  ): void {
    const extractedPlan = extractPlanTextForReview(runtime, stringifyRawInput(params.toolCall));
    emitters.planReview({
      kind: "requested",
      reviewId,
      provider: runtime.provider,
      sessionId: params.sessionId,
      cwd: runtime.cwd,
      requestId: runtime.activeRequestId,
      source: extractedPlan.source,
      canResumeGeneration: true,
      planText: extractedPlan.planText,
      timestamp: createTimestamp(),
    });
  }

  function handleSessionUpdate(runtime: ProviderRuntime, params: ACPSessionUpdateParams): void {
    if (params.sessionId !== runtime.sessionId) {
      return;
    }

    if (params.update.sessionUpdate === "config_option_update") {
      updateRuntimeConfigOptions(
        runtime,
        (params.update as ACPSessionConfigOptionUpdate).configOptions ?? [],
      );
      return;
    }

    if (params.update.sessionUpdate === "current_mode_update") {
      updateRuntimeCurrentMode(
        runtime,
        (params.update as ACPSessionCurrentModeUpdate).currentModeId,
      );
      return;
    }

    if (params.update.sessionUpdate === "plan") {
      runtime.latestStructuredPlanText =
        formatStructuredPlanEntries((params.update as ACPSessionPlanUpdate).entries ?? []) ??
        runtime.latestStructuredPlanText;
      return;
    }

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

    if (!runtime.activeRequestId) {
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

    for (const pendingPlanReview of runtime.pendingPlanReviews.values()) {
      pendingPlanReview.resolve(outcome);
      emitters.planReview({
        kind: "resolved",
        reviewId: pendingPlanReview.reviewId,
        provider: runtime.provider,
        sessionId: pendingPlanReview.sessionId,
        cwd: pendingPlanReview.cwd,
        decision: outcome.outcome === "selected" ? "start_build" : "cancel",
        timestamp,
      });
    }
    runtime.pendingPlanReviews.clear();
  }

  async function handlePermissionRequest(
    runtime: ProviderRuntime,
    params: ACPSessionRequestPermissionParams,
    requestId: ACPRequestId,
  ): Promise<ACPRequestPermissionOutcome> {
    const approvalId = String(requestId);
    const toolCallId = params.toolCall.toolCallId || approvalId;
    const timestamp = createTimestamp();

    if (params.toolCall.kind === "switch_mode") {
      emitPlanReviewRequested(runtime, params, approvalId);
      return await new Promise<ACPRequestPermissionOutcome>((resolve) => {
        runtime.pendingPlanReviews.set(approvalId, {
          reviewId: approvalId,
          sessionId: params.sessionId,
          cwd: runtime.cwd,
          requestId: runtime.activeRequestId,
          toolCallId,
          options: params.options,
          resolve,
        });
      });
    }

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
    const transport = new StdioACPTransport(smokeOptions.cmd, smokeOptions.args, {
      cwd: smokeOptions.cwd,
      onStderr: (chunk) => {
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
      onMessageSent: (message) => {
        if (isJsonRpcRequestLike(message)) {
          rpcRequestMethods.set(getRequestMapKey(message.id), message.method);
        }
        emitACPTranscript(
          provider,
          "outgoing",
          message,
          rpcRequestMethods,
          runtimes.get(provider)?.sessionId,
        );
      },
      onMessageReceived: (message) => {
        if (isJsonRpcRequestLike(message)) {
          rpcRequestMethods.set(getRequestMapKey(message.id), message.method);
        }
        emitACPTranscript(
          provider,
          "incoming",
          message,
          rpcRequestMethods,
          runtimes.get(provider)?.sessionId,
        );
        if (isJsonRpcResponse(message)) {
          rpcRequestMethods.delete(getRequestMapKey(message.id));
        }
      },
      onExit: (code, signal) => {
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

    const client = new ACPClient(transport);
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
    let sessionId = "";
    let sessionSetup:
      | {
          configOptions?: ResolvedSessionModeState["rawConfigOptions"] | null;
          modes?: ResolvedSessionModeState["rawModes"] | null;
        }
      | undefined;
    if (!runtimeOptions.skipSessionCreation) {
      const session = await client.createSession({ cwd, mcpServers: [] });
      providerModelCatalogStore.recordDiscovery(
        provider,
        normalizeDiscoveredProviderModels(session),
        createTimestamp(),
      );
      sessionId = session.sessionId;
      sessionReplay.writeMetadata({ sessionId, provider, cwd });
      sessionSetup = {
        configOptions: session.configOptions,
        modes: session.modes,
      };
    }

    const runtime: ProviderRuntime = {
      provider,
      cwd,
      transport,
      client,
      sessionId,
      modeState: resolveSessionModeState({
        provider,
        sessionId,
        cwd,
        configOptions: sessionSetup?.configOptions,
        modes: sessionSetup?.modes,
      }),
      pendingApprovals: new Map(),
      pendingPlanReviews: new Map(),
      pendingAssistantMessages: new Map(),
      rpcRequestMethods,
      availableCommandsBySession: new Map(),
    };
    client.onSessionUpdate((params) => {
      handleSessionUpdate(runtime, params);
    });
    client.setPermissionRequestHandler(async (params) =>
      handlePermissionRequest(runtime, params, params.requestId),
    );
    if (runtime.sessionId) {
      sessionReplay.writeMetadata({
        sessionId: runtime.sessionId,
        provider,
        cwd,
        mode: runtime.modeState.publicState.normalizedMode,
      });
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
    applyRuntimeSessionSetup(runtime, {
      sessionId,
      configOptions: session.configOptions,
      modes: session.modes,
    });
    runtime.currentModel = undefined;
    sessionReplay.writeMetadata({
      sessionId,
      provider: runtime.provider,
      cwd: runtime.cwd,
      mode: runtime.modeState.publicState.normalizedMode,
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

  function getSessionModeConfig(
    runtime: ProviderRuntime,
  ): SessionModeConfigEventPayload["modeConfig"] {
    return runtime.modeState.publicState;
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
      return instruction.state.publicState;
    }

    if (instruction.kind === "set_config_option") {
      const params: ACPSessionSetConfigOptionParams = {
        sessionId: runtime.sessionId,
        configId: instruction.configId,
        value: instruction.value,
      };
      const result = await runtime.client.setConfigOption(params);
      runtime.modeState = resolveSessionModeState({
        provider: runtime.provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        configOptions: result.configOptions,
        previous: runtime.modeState,
      });
      emitSessionModeConfig(runtime);
      sessionReplay.writeMetadata({
        sessionId: runtime.sessionId,
        provider: runtime.provider,
        cwd: runtime.cwd,
        mode: runtime.modeState.publicState.normalizedMode,
      });
      return runtime.modeState.publicState;
    }

    await runtime.client.setMode({
      sessionId: runtime.sessionId,
      modeId: instruction.modeId,
    });
    updateRuntimeCurrentMode(runtime, instruction.modeId);
    sessionReplay.writeMetadata({
      sessionId: runtime.sessionId,
      provider: runtime.provider,
      cwd: runtime.cwd,
      mode: runtime.modeState.publicState.normalizedMode,
    });
    return runtime.modeState.publicState;
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
    pendingPlanReview.resolve(resolvePlanReviewOutcome(decision, pendingPlanReview.options));
    const respondedAt = createTimestamp();
    emitters.planReview({
      kind: "resolved",
      reviewId,
      provider: runtime.provider,
      sessionId: pendingPlanReview.sessionId,
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
    adoptSessionSetup: (runtime, sessionId, setup) => {
      applyRuntimeSessionSetup(runtime, {
        sessionId,
        configOptions: setup.configOptions,
        modes: setup.modes,
      });
    },
    switchRuntimeSession,
    prepareRuntimeForModel,
    getSessionModeConfig,
    setSessionMode,
    respondToPlanReview,
    flushAssistantMessage,
    emitChatError,
    resolvePendingApprovals,
    getRuntime: (provider) => runtimes.get(provider),
  };
}
