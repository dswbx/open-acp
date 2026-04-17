import { BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { normalizeDiscoveredProviderModels } from "./providerModelDiscovery.ts";
import { createProviderModelCatalogStore } from "./providerModelCatalogStore.ts";
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

interface ProviderRuntime {
  provider: SmokeProvider;
  cwd: string;
  transport: StdioACPTransport;
  client: ACPClient;
  sessionId: string;
  currentModel?: string;
  activeRequestId?: string;
  pendingApprovals: Map<string, PendingApproval>;
  rpcRequestMethods: Map<string, string>;
}

interface CreateProviderRuntimeOptions {
  skipSessionCreation?: boolean;
}

interface PendingApproval {
  approvalId: string;
  sessionId: string;
  requestId?: string;
  toolCallId: string;
  resolve: (outcome: ACPRequestPermissionOutcome) => void;
}

let mainWindow: BrowserWindow<any> | undefined;
const providerRuntimes = new Map<SmokeProvider, ProviderRuntime>();
const providerModelCatalogStore = createProviderModelCatalogStore();

function createTimestamp(): string {
  return new Date().toISOString();
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
    cwd: cwd ?? process.cwd(),
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

function emitChatError(
  runtime: ProviderRuntime,
  requestId: string,
  message: string
): void {
  emitChatStreamEvent({
    requestId,
    provider: runtime.provider,
    sessionId: runtime.sessionId,
    kind: "error",
    text: message,
    timestamp: createTimestamp()
  });
}

function handleSessionUpdate(runtime: ProviderRuntime, params: ACPSessionUpdateParams): void {
  if (!runtime.activeRequestId || params.sessionId !== runtime.sessionId) {
    return;
  }

  if (params.update.sessionUpdate !== "agent_message_chunk") {
    return;
  }

  const text = extractChunkText(params.update);
  if (!text) {
    return;
  }

  emitChatStreamEvent({
    requestId: runtime.activeRequestId,
    provider: runtime.provider,
    sessionId: runtime.sessionId,
    kind: "agent_chunk",
    text,
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
      kind: "agent_complete",
      stopReason: result.stopReason ?? "unknown",
      timestamp: createTimestamp()
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
      getProviderModelCatalog: async ({ provider, cwd }) => {
        await ensureProviderRuntime(provider, cwd ?? process.cwd());
        return {
          provider,
          catalog: providerModelCatalogStore.get(provider)
        };
      },
      createChatSession: async ({ provider, cwd }) => {
        const runtimeCwd = cwd ?? process.cwd();
        const existing = providerRuntimes.get(provider);
        if (!existing || existing.cwd !== runtimeCwd) {
          const runtime = await ensureProviderRuntime(provider, runtimeCwd);
          return {
            provider,
            sessionId: runtime.sessionId
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
          sessionId: session.sessionId
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

        const runtime = await ensureProviderRuntime(provider, cwd ?? process.cwd());
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

        emitChatStreamEvent({
          requestId,
          provider,
          sessionId: preparedRuntime.sessionId,
          kind: "session_ready",
          timestamp: createTimestamp()
        });

        void runChatPrompt(preparedRuntime, requestId, messageText);

        return {
          requestId,
          provider,
          sessionId: preparedRuntime.sessionId,
          model: resolvedModel
        };
      },
      cancelChatMessage: async ({ provider, requestId, sessionId, cwd }) => {
        const runtime = await ensureProviderRuntime(provider, cwd ?? process.cwd());
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
          cancelledAt: createTimestamp()
        };
      },
      respondToApproval: async ({
        provider,
        approvalId,
        outcome,
        cwd
      }): Promise<RespondToApprovalResult> => {
        const runtime = await ensureProviderRuntime(provider, cwd ?? process.cwd());
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
          requestId: pendingApproval.requestId,
          toolCallId: pendingApproval.toolCallId,
          outcome,
          timestamp: respondedAt
        });

        return {
          provider,
          approvalId,
          sessionId: pendingApproval.sessionId,
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

mainWindow = new BrowserWindow({
  title: "Agent Orchestrator",
  url: viewUrl,
  rpc,
  frame: {
    width: 1200,
    height: 820,
    x: 120,
    y: 80
  }
});

console.log("Electrobun runtime started.");
