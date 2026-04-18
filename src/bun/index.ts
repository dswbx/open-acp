import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationMenu, BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { normalizeDiscoveredProviderModels } from "./providerModelDiscovery.ts";
import { createProviderModelCatalogStore } from "./providerModelCatalogStore.ts";
import { SessionTranscriptStore } from "./SessionTranscriptStore.ts";
import { RealAgentSmokeRunner } from "../cli/RealAgentSmoke.ts";
import type { RealAgentSmokeOptions } from "../cli/RealAgentSmoke.ts";
import { ACPClient } from "../core/acp/ACPClient.ts";
import { StdioACPTransport } from "../core/acp/StdioACPTransport.ts";
import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse,
  ACPRequestId,
  ACPRequestPermissionOutcome,
  ACPSessionRequestPermissionParams,
  ACPSessionUpdate,
  ACPSessionUpdateParams
} from "../core/acp/ACPTypes.ts";
import type {
  AgentTranscriptEventPayload,
  ApprovalEventPayload,
  ChatToolCallState,
  ChatStreamEventPayload,
  OrchestratorRPC,
  RespondToApprovalResult,
  SmokeEventPayload,
  SmokeFinishedPayload,
  SmokeProvider
} from "../shared/AppRPC.ts";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DEFAULT_PROMPT = "Reply with one short sentence.";
const APP_NAME = "Agent Orchestrator";

interface ProviderRuntime {
  provider: SmokeProvider;
  cwd: string;
  transport: StdioACPTransport;
  client: ACPClient;
  sessionId: string;
  currentModel?: string;
  activeRequestId?: string;
  pendingApprovals: Map<string, PendingApproval>;
  pendingAssistantMessages: Map<string, PendingAssistantMessage>;
  rpcRequestMethods: Map<string, string>;
}

interface CreateProviderRuntimeOptions {
  skipSessionCreation?: boolean;
}

interface PendingApproval {
  approvalId: string;
  sessionId: string;
  cwd: string;
  requestId?: string;
  toolCallId: string;
  resolve: (outcome: ACPRequestPermissionOutcome) => void;
}

interface PendingAssistantMessage {
  requestId: string;
  sessionId: string;
  provider: SmokeProvider;
  model?: string;
  text: string;
}

let mainWindow: BrowserWindow<any> | undefined;
const providerRuntimes = new Map<SmokeProvider, ProviderRuntime>();
const providerModelCatalogStore = createProviderModelCatalogStore();
const sessionTranscriptStore = new SessionTranscriptStore();
const DEFAULT_WORKSPACE_CWD = resolveDefaultWorkspaceCwd();

function createTimestamp(): string {
  return new Date().toISOString();
}

function resolveDefaultWorkspaceCwd(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  let candidateDirectory = moduleDirectory;

  while (true) {
    const packageJsonPath = path.join(candidateDirectory, "package.json");
    const gitDirectoryPath = path.join(candidateDirectory, ".git");
    if (existsSync(packageJsonPath) || existsSync(gitDirectoryPath)) {
      return candidateDirectory;
    }

    const parentDirectory = path.dirname(candidateDirectory);
    if (parentDirectory === candidateDirectory) {
      return process.cwd();
    }
    candidateDirectory = parentDirectory;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeLogMessage(line: string): string | undefined {
  const cleaned = line.replace(/\r?\n/g, "").trim();
  if (cleaned.length === 0) {
    return undefined;
  }
  return cleaned;
}

function emitSmokeEvent(payload: SmokeEventPayload): void {
  mainWindow?.webview.rpc.send.smokeEvent(payload);
}

function emitSmokeFinished(payload: SmokeFinishedPayload): void {
  mainWindow?.webview.rpc.send.smokeFinished(payload);
}

function emitChatStreamEvent(payload: ChatStreamEventPayload): void {
  mainWindow?.webview.rpc.send.chatStreamEvent(payload);
}

function emitApprovalEvent(payload: ApprovalEventPayload): void {
  mainWindow?.webview.rpc.send.approvalEvent(payload);
}

function emitAgentTranscriptEvent(payload: AgentTranscriptEventPayload): void {
  mainWindow?.webview.rpc.send.agentTranscriptEvent(payload);
}

function getRequestMapKey(requestId: ACPRequestId): string {
  return String(requestId);
}

function isJsonRpcResponse(
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse
): message is ACPJsonRpcResponse {
  return !("method" in message);
}

function isJsonRpcRequestLike(
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse
): message is ACPJsonRpcRequest {
  return "method" in message && "id" in message;
}

function isJsonRpcNotificationLike(
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse
): message is ACPJsonRpcNotification {
  return "method" in message && !("id" in message);
}

function inferSessionIdFromMessage(
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
  fallbackSessionId?: string
): string | undefined {
  if ("params" in message && isRecord(message.params) && typeof message.params.sessionId === "string") {
    return message.params.sessionId;
  }
  if ("result" in message && isRecord(message.result) && typeof message.result.sessionId === "string") {
    return message.result.sessionId;
  }
  return fallbackSessionId;
}

function stringifyRawInput(toolCall: ACPSessionRequestPermissionParams["toolCall"]): string | undefined {
  if (typeof toolCall.rawInput === "string") {
    return toolCall.rawInput;
  }
  if (toolCall.rawInput === null || toolCall.rawInput === undefined) {
    return undefined;
  }
  return JSON.stringify(toolCall.rawInput, null, 2);
}

function emitACPTranscript(
  provider: SmokeProvider,
  direction: AgentTranscriptEventPayload["direction"],
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
  requestMethods: Map<string, string>,
  fallbackSessionId?: string
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
      requestId === undefined
        ? undefined
        : requestMethods.get(getRequestMapKey(requestId));
  }

  emitAgentTranscriptEvent({
    entryId: crypto.randomUUID(),
    provider,
    sessionId: inferSessionIdFromMessage(message, fallbackSessionId),
    direction,
    kind,
    method,
    requestId,
    summary:
      kind === "response"
        ? `${method ?? "rpc"} response`
        : method ?? kind,
    json: JSON.stringify(message, null, 2),
    timestamp: createTimestamp()
  });
}

function createSmokeRunnerOptions(
  provider: SmokeProvider,
  prompt?: string,
  cwd?: string
): RealAgentSmokeOptions {
  const shared = {
    cwd: cwd ?? DEFAULT_WORKSPACE_CWD,
    prompt: prompt ?? DEFAULT_PROMPT,
    protocolVersion: 1
  };

  switch (provider) {
    case "codex":
      return {
        ...shared,
        cmd: "npx",
        args: ["-y", "@zed-industries/codex-acp"]
      };
    case "claude":
      return {
        ...shared,
        cmd: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp"]
      };
    case "opencode":
      return {
        ...shared,
        cmd: "opencode",
        args: ["acp"]
      };
  }
}

function extractChunkText(update: ACPSessionUpdate): string | undefined {
  const content = (update as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  if (isRecord(content) && typeof content.text === "string") {
    return content.text;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }

  return content
    .map((item) => {
      if (!isRecord(item) || typeof item.text !== "string") {
        return "";
      }
      return item.text;
    })
    .join("");
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function summarizeSessionUpdate(update: ACPSessionUpdate): string | undefined {
  switch (update.sessionUpdate) {
    case "available_commands_update": {
      const commands = (update as { availableCommands?: unknown[] }).availableCommands;
      return Array.isArray(commands)
        ? `Loaded ${commands.length} available commands`
        : "Loaded available commands";
    }
    case "usage_update":
    case "tool_call":
    case "tool_call_update":
    case "agent_message_chunk":
      return undefined;
    default:
      return update.sessionUpdate.replaceAll("_", " ");
  }
}

function extractToolState(status: string | null | undefined): ChatToolCallState {
  switch (status) {
    case "pending":
      return "input-streaming";
    case "in_progress":
    case "running":
      return "input-available";
    case "completed":
    case "success":
      return "output-available";
    case "denied":
    case "rejected":
    case "cancelled":
      return "output-denied";
    case "failed":
    case "error":
      return "output-error";
    default:
      return "input-available";
  }
}

function extractToolErrorText(rawOutput: unknown): string | undefined {
  if (typeof rawOutput === "string") {
    return rawOutput;
  }
  if (!isRecord(rawOutput)) {
    return undefined;
  }
  const directError = rawOutput.error;
  if (typeof directError === "string" && directError.trim().length > 0) {
    return directError;
  }
  const stderr = rawOutput.stderr;
  if (typeof stderr === "string" && stderr.trim().length > 0) {
    return stderr;
  }
  return undefined;
}

function extractUsage(update: ACPSessionUpdate): { used: number; size: number } | undefined {
  const used = (update as { used?: unknown }).used;
  const size = (update as { size?: unknown }).size;
  if (typeof used !== "number" || typeof size !== "number") {
    return undefined;
  }
  return { used, size };
}

function emitChatError(
  runtime: ProviderRuntime,
  requestId: string,
  message: string
): void {
  emitChatStreamEvent({
    requestId,
    provider: runtime.provider,
    sessionId: runtime.sessionId,
    cwd: runtime.cwd,
    kind: "error",
    text: message,
    timestamp: createTimestamp()
  });
  void flushAssistantMessage(runtime, requestId, {
    timestamp: createTimestamp(),
    status: "error",
    error: message
  });
}

function appendSessionTranscriptRecord(
  runtime: ProviderRuntime,
  sessionId: string,
  record: {
    timestamp: string;
    type: "user_message" | "assistant_message" | "system_message";
    payload: Record<string, unknown>;
  }
): void {
  void sessionTranscriptStore
    .appendRecord({
      cwd: DEFAULT_WORKSPACE_CWD,
      sessionId,
      record
    })
    .catch((error) => {
      console.error(
        `Failed to append session transcript for ${sessionId}:`,
        error
      );
    });
}

function flushAssistantMessage(
  runtime: ProviderRuntime,
  requestId: string,
  options: {
    timestamp: string;
    status: "complete" | "error" | "cancelled";
    stopReason?: string;
    error?: string;
  }
): Promise<void> {
  const pendingMessage = runtime.pendingAssistantMessages.get(requestId);
  if (!pendingMessage) {
    return Promise.resolve();
  }

  runtime.pendingAssistantMessages.delete(requestId);
  return sessionTranscriptStore.appendRecord({
    cwd: DEFAULT_WORKSPACE_CWD,
    sessionId: pendingMessage.sessionId,
    record: {
      timestamp: options.timestamp,
      type: "assistant_message",
      payload: {
        requestId: pendingMessage.requestId,
        provider: pendingMessage.provider,
        model: pendingMessage.model,
        text: pendingMessage.text,
        status: options.status,
        stopReason: options.stopReason,
        error: options.error
      }
    }
  });
}

function handleSessionUpdate(runtime: ProviderRuntime, params: ACPSessionUpdateParams): void {
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
      pendingMessage.text += text;
    }
    emitChatStreamEvent({
      requestId: runtime.activeRequestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      kind: "agent_chunk",
      text,
      timestamp: createTimestamp()
    });
    return;
  }

  if (params.update.sessionUpdate === "tool_call") {
    emitChatStreamEvent({
      requestId: runtime.activeRequestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      kind: "tool_call",
      toolCallId: String((params.update as { toolCallId?: unknown }).toolCallId ?? crypto.randomUUID()),
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
          : undefined
      ),
      input:
        (params.update as { rawInput?: unknown }).rawInput ??
        (params.update as { input?: unknown }).input,
      timestamp: createTimestamp()
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
        : undefined
    );
    emitChatStreamEvent({
      requestId: runtime.activeRequestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      kind: "tool_call_update",
      toolCallId: String((params.update as { toolCallId?: unknown }).toolCallId ?? crypto.randomUUID()),
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
      timestamp: createTimestamp()
    });
    return;
  }

  if (params.update.sessionUpdate === "usage_update") {
    const usage = extractUsage(params.update);
    if (!usage) {
      return;
    }
    emitChatStreamEvent({
      requestId: runtime.activeRequestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      kind: "usage_update",
      used: usage.used,
      size: usage.size,
      timestamp: createTimestamp()
    });
    return;
  }

  const summary = summarizeSessionUpdate(params.update);
  if (!summary) {
    return;
  }

  emitChatStreamEvent({
    requestId: runtime.activeRequestId,
    provider: runtime.provider,
    sessionId: runtime.sessionId,
    cwd: runtime.cwd,
    kind: "reasoning_update",
    eventId: crypto.randomUUID(),
    updateType: params.update.sessionUpdate,
    summary,
    timestamp: createTimestamp()
  });
}

function resolvePendingApprovals(
  runtime: ProviderRuntime,
  outcome: ACPRequestPermissionOutcome
): void {
  const timestamp = createTimestamp();
  for (const pendingApproval of runtime.pendingApprovals.values()) {
    pendingApproval.resolve(outcome);
    emitApprovalEvent({
      kind: "resolved",
      approvalId: pendingApproval.approvalId,
      provider: runtime.provider,
      sessionId: pendingApproval.sessionId,
      cwd: pendingApproval.cwd,
      requestId: pendingApproval.requestId,
      toolCallId: pendingApproval.toolCallId,
      outcome,
      timestamp
    });
  }
  runtime.pendingApprovals.clear();
}

async function handlePermissionRequest(
  runtime: ProviderRuntime,
  params: ACPSessionRequestPermissionParams,
  requestId: ACPRequestId
): Promise<ACPRequestPermissionOutcome> {
  const approvalId = String(requestId);
  const toolCallId = params.toolCall.toolCallId || approvalId;
  const timestamp = createTimestamp();

  emitApprovalEvent({
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
      line: location.line ?? undefined
    })),
    options: params.options.map((option) => ({
      optionId: option.optionId,
      name: option.name,
      kind: option.kind
    })),
    timestamp
  });

  return await new Promise<ACPRequestPermissionOutcome>((resolve) => {
    runtime.pendingApprovals.set(approvalId, {
      approvalId,
      sessionId: params.sessionId,
      cwd: runtime.cwd,
      requestId: runtime.activeRequestId,
      toolCallId,
      resolve
    });
  });
}

async function createProviderRuntime(
  provider: SmokeProvider,
  cwd: string,
  runtimeOptions: CreateProviderRuntimeOptions = {}
): Promise<ProviderRuntime> {
  const smokeOptions = createSmokeRunnerOptions(provider, DEFAULT_PROMPT, cwd);
  const rpcRequestMethods = new Map<string, string>();
  const transport = new StdioACPTransport(smokeOptions.cmd, smokeOptions.args, {
    cwd: smokeOptions.cwd,
    onStderr: (chunk) => {
      const message = normalizeLogMessage(chunk);
      if (!message) {
        return;
      }
      const runtime = providerRuntimes.get(provider);
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
        providerRuntimes.get(provider)?.sessionId
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
        providerRuntimes.get(provider)?.sessionId
      );
      if (isJsonRpcResponse(message)) {
        rpcRequestMethods.delete(getRequestMapKey(message.id));
      }
    },
    onExit: (code, signal) => {
      const runtime = providerRuntimes.get(provider);
      if (!runtime) {
        return;
      }
      providerRuntimes.delete(provider);
      resolvePendingApprovals(runtime, {
        outcome: "cancelled"
      });
      if (!runtime.activeRequestId) {
        return;
      }
      emitChatError(
        runtime,
        runtime.activeRequestId,
        `Agent process exited unexpectedly (code=${String(code)}, signal=${signal ?? "none"}).`
      );
      runtime.activeRequestId = undefined;
    }
  });

  const client = new ACPClient(transport);
  await client.connect();
  await client.initialize({
    protocolVersion: 1,
    clientCapabilities: {
      terminal: true
    },
    clientInfo: {
      name: "agent-orchestrator-poc",
      title: "Agent Orchestrator POC",
      version: "0.1.0"
    }
  });
  let sessionId = "";
  if (!runtimeOptions.skipSessionCreation) {
    const session = await client.createSession({
      cwd,
      mcpServers: []
    });
    providerModelCatalogStore.recordDiscovery(
      provider,
      normalizeDiscoveredProviderModels(session),
      createTimestamp()
    );
    sessionId = session.sessionId;
  }

  const runtime: ProviderRuntime = {
    provider,
    cwd,
    transport,
    client,
    sessionId,
    pendingApprovals: new Map(),
    pendingAssistantMessages: new Map(),
    rpcRequestMethods
  };
  client.onSessionUpdate((params) => {
    handleSessionUpdate(runtime, params);
  });
  client.setPermissionRequestHandler(async (params) =>
    handlePermissionRequest(runtime, params, params.requestId)
  );
  return runtime;
}

async function ensureProviderRuntime(
  provider: SmokeProvider,
  cwd: string
): Promise<ProviderRuntime> {
  const existing = providerRuntimes.get(provider);
  if (existing && existing.cwd === cwd) {
    return existing;
  }
  if (existing) {
    providerRuntimes.delete(provider);
    await existing.client.disconnect();
  }

  const runtime = await createProviderRuntime(provider, cwd);
  providerRuntimes.set(provider, runtime);
  return runtime;
}

async function switchRuntimeSession(
  runtime: ProviderRuntime,
  sessionId: string
): Promise<void> {
  if (runtime.sessionId === sessionId) {
    return;
  }

  const session = await runtime.client.loadSession({
    sessionId,
    cwd: runtime.cwd,
    mcpServers: []
  });
  providerModelCatalogStore.recordDiscovery(
    runtime.provider,
    normalizeDiscoveredProviderModels(session),
    createTimestamp()
  );
  runtime.sessionId = sessionId;
  runtime.currentModel = undefined;
}

async function prepareRuntimeForModel(
  runtime: ProviderRuntime,
  model?: string,
  targetSessionId?: string
): Promise<ProviderRuntime> {
  if (!model && runtime.currentModel) {
    runtime.activeRequestId = undefined;
    providerRuntimes.delete(runtime.provider);
    await runtime.client.disconnect();
    const recreated = await createProviderRuntime(runtime.provider, runtime.cwd, {
      skipSessionCreation: Boolean(targetSessionId)
    });
    try {
      if (targetSessionId) {
        await switchRuntimeSession(recreated, targetSessionId);
      }
      providerRuntimes.set(runtime.provider, recreated);
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
    modelId: model
  });
  runtime.currentModel = model;
  return runtime;
}

async function runChatPrompt(
  runtime: ProviderRuntime,
  requestId: string,
  message: string
): Promise<void> {
  try {
    const result = await runtime.client.prompt({
      sessionId: runtime.sessionId,
      prompt: [
        {
          type: "text",
          text: message
        }
      ]
    });

    emitChatStreamEvent({
      requestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      kind: "agent_complete",
      stopReason: result.stopReason ?? "unknown",
      timestamp: createTimestamp()
    });
    void flushAssistantMessage(runtime, requestId, {
      timestamp: createTimestamp(),
      status: result.stopReason === "cancelled" ? "cancelled" : "complete",
      stopReason: result.stopReason ?? "unknown"
    }).catch((error) => {
      console.error(
        `Failed to flush assistant transcript for ${runtime.sessionId}:`,
        error
      );
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    emitChatError(runtime, requestId, messageText);
  } finally {
    if (runtime.pendingApprovals.size > 0) {
      resolvePendingApprovals(runtime, {
        outcome: "cancelled"
      });
    }
    if (runtime.activeRequestId === requestId) {
      runtime.activeRequestId = undefined;
    }
  }
}

async function executeSmokeRun(
  runId: string,
  provider: SmokeProvider,
  prompt?: string,
  cwd?: string
): Promise<void> {
  const options = createSmokeRunnerOptions(provider, prompt, cwd);
  const runner = new RealAgentSmokeRunner({
    stdoutWriter: (line) => {
      const message = normalizeLogMessage(line);
      if (!message) {
        return;
      }
      emitSmokeEvent({
        runId,
        provider,
        level: "update",
        message,
        timestamp: createTimestamp()
      });
    },
    stderrWriter: (line) => {
      const message = normalizeLogMessage(line);
      if (!message) {
        return;
      }
      emitSmokeEvent({
        runId,
        provider,
        level: "error",
        message,
        timestamp: createTimestamp()
      });
    }
  });

  try {
    await runner.run(options);
    emitSmokeFinished({
      runId,
      provider,
      success: true,
      timestamp: createTimestamp()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitSmokeFinished({
      runId,
      provider,
      success: false,
      error: message,
      timestamp: createTimestamp()
    });
  }
}

const rpc = BrowserView.defineRPC<OrchestratorRPC>({
  handlers: {
    requests: {
      getHomeDirectory: async () => ({
        path: homedir()
      }),
      chooseWorkingDirectory: async ({ startingFolder }) => {
        const selectedPaths = await Utils.openFileDialog({
          startingFolder: startingFolder?.trim() || homedir(),
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false
        });
        const path = selectedPaths.find((entry) => entry.trim().length > 0);
        return {
          path
        };
      },
      getProviderModelCatalog: async ({ provider, cwd }) => {
        await ensureProviderRuntime(provider, cwd ?? DEFAULT_WORKSPACE_CWD);
        return {
          provider,
          catalog: providerModelCatalogStore.get(provider)
        };
      },
      createChatSession: async ({ provider, cwd }) => {
        const runtimeCwd = cwd ?? DEFAULT_WORKSPACE_CWD;
        const existing = providerRuntimes.get(provider);
        if (!existing || existing.cwd !== runtimeCwd) {
          const runtime = await ensureProviderRuntime(provider, runtimeCwd);
          return {
            provider,
            sessionId: runtime.sessionId,
            cwd: runtime.cwd
          };
        }

        const runtime = existing;
        if (runtime.activeRequestId) {
          throw new Error(`${provider} is already processing a message.`);
        }

        const session = await runtime.client.createSession({
          cwd: runtime.cwd,
          mcpServers: []
        });
        providerModelCatalogStore.recordDiscovery(
          provider,
          normalizeDiscoveredProviderModels(session),
          createTimestamp()
        );
        runtime.sessionId = session.sessionId;
        runtime.currentModel = undefined;

        return {
          provider,
          sessionId: session.sessionId,
          cwd: runtime.cwd
        };
      },
      startSmokeTest: ({ provider, prompt, cwd }) => {
        const runId = crypto.randomUUID();
        const startedAt = createTimestamp();

        emitSmokeEvent({
          runId,
          provider,
          level: "info",
          message: `Starting ${provider} smoke run...`,
          timestamp: startedAt
        });

        void executeSmokeRun(runId, provider, prompt, cwd);

        return {
          runId,
          provider,
          startedAt
        };
      },
      sendChatMessage: async ({ provider, message, model, sessionId, cwd }) => {
        const messageText = message.trim();
        if (messageText.length === 0) {
          throw new Error("Message cannot be empty.");
        }

        const requestedSessionId = sessionId?.trim();

        const selectedModel = model?.trim();
        const resolvedModel =
          selectedModel && selectedModel.length > 0 ? selectedModel : undefined;

        const runtime = await ensureProviderRuntime(provider, cwd ?? DEFAULT_WORKSPACE_CWD);
        if (runtime.activeRequestId) {
          throw new Error(`${provider} is already processing a message.`);
        }

        if (requestedSessionId && requestedSessionId.length > 0) {
          await switchRuntimeSession(runtime, requestedSessionId);
        }

        const preparedRuntime = await prepareRuntimeForModel(
          runtime,
          resolvedModel,
          requestedSessionId
        );
        if (preparedRuntime.activeRequestId) {
          throw new Error(`${provider} is already processing a message.`);
        }

        const requestId = crypto.randomUUID();
        preparedRuntime.activeRequestId = requestId;
        preparedRuntime.pendingAssistantMessages.set(requestId, {
          requestId,
          sessionId: preparedRuntime.sessionId,
          provider,
          model: resolvedModel,
          text: ""
        });

        appendSessionTranscriptRecord(preparedRuntime, preparedRuntime.sessionId, {
          timestamp: createTimestamp(),
          type: "user_message",
          payload: {
            requestId,
            provider,
            model: resolvedModel,
            text: messageText
          }
        });

        emitChatStreamEvent({
          requestId,
          provider,
          sessionId: preparedRuntime.sessionId,
          cwd: preparedRuntime.cwd,
          kind: "session_ready",
          timestamp: createTimestamp()
        });

        void runChatPrompt(preparedRuntime, requestId, messageText);

        return {
          requestId,
          provider,
          sessionId: preparedRuntime.sessionId,
          cwd: preparedRuntime.cwd,
          model: resolvedModel
        };
      },
      cancelChatMessage: async ({ provider, requestId, sessionId, cwd }) => {
        const runtime = await ensureProviderRuntime(provider, cwd ?? DEFAULT_WORKSPACE_CWD);
        if (sessionId?.trim()) {
          await switchRuntimeSession(runtime, sessionId.trim());
        }
        if (!runtime.activeRequestId) {
          throw new Error(`${provider} is not processing a message.`);
        }
        if (requestId && requestId !== runtime.activeRequestId) {
          throw new Error(
            `Active request mismatch: expected ${runtime.activeRequestId}, received ${requestId}.`
          );
        }
        const activeRequestId = runtime.activeRequestId;

        resolvePendingApprovals(runtime, {
          outcome: "cancelled"
        });
        await runtime.client.cancel({
          sessionId: runtime.sessionId
        });

        return {
          provider,
          requestId: activeRequestId,
          sessionId: runtime.sessionId,
          cwd: runtime.cwd,
          cancelledAt: createTimestamp()
        };
      },
      respondToApproval: async ({
        provider,
        approvalId,
        outcome,
        cwd
      }): Promise<RespondToApprovalResult> => {
        const runtime = await ensureProviderRuntime(provider, cwd ?? DEFAULT_WORKSPACE_CWD);
        const pendingApproval = runtime.pendingApprovals.get(approvalId);
        if (!pendingApproval) {
          throw new Error(`Unknown approval request: ${approvalId}`);
        }

        runtime.pendingApprovals.delete(approvalId);
        pendingApproval.resolve(outcome);
        const respondedAt = createTimestamp();
        emitApprovalEvent({
          kind: "resolved",
          approvalId,
          provider,
          sessionId: pendingApproval.sessionId,
          cwd: pendingApproval.cwd,
          requestId: pendingApproval.requestId,
          toolCallId: pendingApproval.toolCallId,
          outcome,
          timestamp: respondedAt
        });

        return {
          provider,
          approvalId,
          sessionId: pendingApproval.sessionId,
          cwd: pendingApproval.cwd,
          outcome,
          respondedAt
        };
      }
    }
  }
});

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: using ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log("Vite dev server not detected; using bundled view.");
    }
  }
  return "views://mainview/index.html";
}

const viewUrl = await getMainViewUrl();

ApplicationMenu.setApplicationMenu([
  {
    label: APP_NAME,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "showAll" },
      { type: "separator" },
      { role: "quit" }
    ]
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" }
    ]
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { role: "close" },
      { role: "bringAllToFront" }
    ]
  },
  {
    label: "Help",
    submenu: [{ role: "showHelp" }]
  }
]);

mainWindow = new BrowserWindow({
  title: APP_NAME,
  url: viewUrl,
  rpc,
  titleBarStyle: "hiddenInset",
  frame: {
    width: 1200,
    height: 820,
    x: 120,
    y: 80
  }
});

console.log("Electrobun runtime started.");
