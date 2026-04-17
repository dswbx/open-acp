import { BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { RealAgentSmokeRunner } from "../cli/RealAgentSmoke.ts";
import type { RealAgentSmokeOptions } from "../cli/RealAgentSmoke.ts";
import { ACPClient } from "../core/acp/ACPClient.ts";
import { StdioACPTransport } from "../core/acp/StdioACPTransport.ts";
import type { ACPSessionUpdate, ACPSessionUpdateParams } from "../core/acp/ACPTypes.ts";
import type {
  ChatStreamEventPayload,
  OrchestratorRPC,
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
}

let mainWindow: BrowserWindow<any> | undefined;
const providerRuntimes = new Map<SmokeProvider, ProviderRuntime>();

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

async function createProviderRuntime(
  provider: SmokeProvider,
  cwd: string
): Promise<ProviderRuntime> {
  const options = createSmokeRunnerOptions(provider, DEFAULT_PROMPT, cwd);
  const transport = new StdioACPTransport(options.cmd, options.args, {
    cwd: options.cwd,
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
    onExit: (code, signal) => {
      const runtime = providerRuntimes.get(provider);
      if (!runtime) {
        return;
      }
      providerRuntimes.delete(provider);
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
  const session = await client.createSession({
    cwd,
    mcpServers: []
  });

  const runtime: ProviderRuntime = {
    provider,
    cwd,
    transport,
    client,
    sessionId: session.sessionId
  };
  client.onSessionUpdate((params) => {
    handleSessionUpdate(runtime, params);
  });
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

async function prepareRuntimeForModel(
  runtime: ProviderRuntime,
  model?: string
): Promise<ProviderRuntime> {
  if (!model && runtime.currentModel) {
    runtime.activeRequestId = undefined;
    providerRuntimes.delete(runtime.provider);
    await runtime.client.disconnect();
    const recreated = await createProviderRuntime(runtime.provider, runtime.cwd);
    providerRuntimes.set(runtime.provider, recreated);
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
    model
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
      sendChatMessage: async ({ provider, message, model, cwd }) => {
        const messageText = message.trim();
        if (messageText.length === 0) {
          throw new Error("Message cannot be empty.");
        }

        const selectedModel = model?.trim();
        const resolvedModel =
          selectedModel && selectedModel.length > 0 ? selectedModel : undefined;

        const runtime = await ensureProviderRuntime(provider, cwd ?? process.cwd());
        if (runtime.activeRequestId) {
          throw new Error(`${provider} is already processing a message.`);
        }

        const preparedRuntime = await prepareRuntimeForModel(runtime, resolvedModel);
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
