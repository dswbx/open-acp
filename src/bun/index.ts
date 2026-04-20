import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationMenu, BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { createProviderModelCatalogStore } from "./providerModelCatalogStore.ts";
import { SessionTranscriptStore } from "./SessionTranscriptStore.ts";
import { createSessionReplayRecorder, createTimestamp } from "./sessionReplay.ts";
import {
  createProviderRuntimeManager,
  createSmokeRunnerOptions,
  type ProviderRuntime,
} from "./providerRuntime.ts";
import { createRpcRequestHandlers } from "./rpcHandlers.ts";
import { ReplayFixtureHarness, startE2EControlServer } from "./e2eHarness.ts";
import { RealAgentSmokeRunner } from "../cli/RealAgentSmoke.ts";

import type {
  AgentTranscriptEventPayload,
  ApprovalEventPayload,
  AvailableCommandsEventPayload,
  ChatStreamEventPayload,
  OrchestratorRPC,
  SmokeEventPayload,
  SmokeFinishedPayload,
  SmokeProvider,
} from "../shared/AppRPC.ts";

import { normalizeLogMessage } from "./acpHelpers.ts";
import { logger } from "../shared/logger.ts";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DEFAULT_PROMPT = "Reply with one short sentence.";
const APP_NAME = "Agent Orchestrator";
const E2E_MODE_ENABLED = process.env.ACP_E2E === "1";
const E2E_CONTROL_PORT = Number.parseInt(process.env.ACP_E2E_PORT ?? "47831", 10);

// eslint-disable-next-line prefer-const
let mainWindow: BrowserWindow<any> | undefined;
const providerModelCatalogStore = createProviderModelCatalogStore();
const sessionTranscriptStore = new SessionTranscriptStore();
const DEFAULT_WORKSPACE_CWD = resolveDefaultWorkspaceCwd();
const sessionReplay = createSessionReplayRecorder({
  store: sessionTranscriptStore,
  workspaceRoot: DEFAULT_WORKSPACE_CWD,
});
const providerRuntimeManager = createProviderRuntimeManager({
  workspaceRoot: DEFAULT_WORKSPACE_CWD,
  defaultPrompt: DEFAULT_PROMPT,
  sessionReplay,
  transcriptStore: sessionTranscriptStore,
  providerModelCatalogStore,
  emitters: {
    chatStream: (payload) => emitChatStreamEvent(payload),
    approval: (payload) => emitApprovalEvent(payload),
    availableCommands: (payload) => emitAvailableCommandsEvent(payload),
    agentTranscript: (payload) => emitAgentTranscriptEvent(payload),
  },
});
const replayFixtureHarness = E2E_MODE_ENABLED
  ? new ReplayFixtureHarness({
      fixturesRoot: path.join(DEFAULT_WORKSPACE_CWD, "tests", "e2e", "fixtures"),
      transcriptStore: sessionTranscriptStore,
      transcriptRootCwd: DEFAULT_WORKSPACE_CWD,
      emitChatStreamEvent: (payload) => emitChatStreamEvent(payload),
      emitApprovalEvent: (payload) => emitApprovalEvent(payload),
      emitAgentTranscriptEvent: (payload) => emitAgentTranscriptEvent(payload),
    })
  : undefined;

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

function emitSmokeEvent(payload: SmokeEventPayload): void {
  mainWindow?.webview.rpc.send.smokeEvent(payload);
}

function emitSmokeFinished(payload: SmokeFinishedPayload): void {
  mainWindow?.webview.rpc.send.smokeFinished(payload);
}

function emitChatStreamEvent(payload: ChatStreamEventPayload): void {
  mainWindow?.webview.rpc.send.chatStreamEvent(payload);
  sessionReplay.appendEvent(payload.sessionId, {
    type: "chatStreamEvent",
    payload,
  });
}

function emitApprovalEvent(payload: ApprovalEventPayload): void {
  mainWindow?.webview.rpc.send.approvalEvent(payload);
  sessionReplay.appendEvent(payload.sessionId, {
    type: "approvalEvent",
    payload,
  });
}

function emitAvailableCommandsEvent(payload: AvailableCommandsEventPayload): void {
  mainWindow?.webview.rpc.send.availableCommandsEvent(payload);
}

function emitAgentTranscriptEvent(payload: AgentTranscriptEventPayload): void {
  mainWindow?.webview.rpc.send.agentTranscriptEvent(payload);
  if (payload.sessionId) {
    sessionReplay.appendEvent(payload.sessionId, {
      type: "agentTranscriptEvent",
      payload,
    });
  }
}

async function runChatPrompt(
  runtime: ProviderRuntime,
  requestId: string,
  message: string,
): Promise<void> {
  try {
    const result = await runtime.client.prompt({
      sessionId: runtime.sessionId,
      prompt: [
        {
          type: "text",
          text: message,
        },
      ],
    });

    emitChatStreamEvent({
      requestId,
      provider: runtime.provider,
      sessionId: runtime.sessionId,
      cwd: runtime.cwd,
      kind: "agent_complete",
      stopReason: result.stopReason ?? "unknown",
      timestamp: createTimestamp(),
    });
    void providerRuntimeManager
      .flushAssistantMessage(runtime, requestId, {
        timestamp: createTimestamp(),
        status: result.stopReason === "cancelled" ? "cancelled" : "complete",
        stopReason: result.stopReason ?? "unknown",
      })
      .catch((error) => {
        logger.error("Failed to flush assistant transcript", error as Error, {
          sessionId: runtime.sessionId,
        });
      });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    providerRuntimeManager.emitChatError(runtime, requestId, messageText);
  } finally {
    if (runtime.pendingApprovals.size > 0) {
      providerRuntimeManager.resolvePendingApprovals(runtime, {
        outcome: "cancelled",
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
  cwd?: string,
): Promise<void> {
  const options = createSmokeRunnerOptions(
    provider,
    prompt ?? DEFAULT_PROMPT,
    cwd ?? DEFAULT_WORKSPACE_CWD,
  );
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
        timestamp: createTimestamp(),
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
        timestamp: createTimestamp(),
      });
    },
  });

  try {
    await runner.run(options);
    emitSmokeFinished({
      runId,
      provider,
      success: true,
      timestamp: createTimestamp(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitSmokeFinished({
      runId,
      provider,
      success: false,
      error: message,
      timestamp: createTimestamp(),
    });
  }
}

const rpc = BrowserView.defineRPC<OrchestratorRPC>({
  handlers: {
    requests: createRpcRequestHandlers({
      defaultWorkspaceCwd: DEFAULT_WORKSPACE_CWD,
      replayFixtureHarness,
      providerRuntimeManager,
      providerModelCatalogStore,
      sessionReplay,
      emitSmokeEvent,
      emitChatStreamEvent,
      emitApprovalEvent,
      executeSmokeRun: (runId, provider, prompt, cwd) => {
        void executeSmokeRun(runId, provider, prompt, cwd);
      },
      runChatPrompt: (runtime, requestId, message) => {
        void runChatPrompt(runtime, requestId, message);
      },
    }),
  },
});

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      logger.info("HMR enabled", { url: DEV_SERVER_URL });
      return DEV_SERVER_URL;
    } catch {
      logger.info("Vite dev server not detected; using bundled view");
    }
  }
  return "views://mainview/index.html";
}

const viewUrl = await getMainViewUrl();

if (replayFixtureHarness) {
  startE2EControlServer({
    port: E2E_CONTROL_PORT,
    replayHarness: replayFixtureHarness,
    getMainWindow: () => mainWindow,
  });
  logger.info("E2E control server listening", {
    url: `http://127.0.0.1:${E2E_CONTROL_PORT}`,
  });
}

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
      { role: "quit" },
    ],
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
      { role: "selectAll" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { role: "close" },
      { role: "bringAllToFront" },
    ],
  },
  {
    label: "Help",
    submenu: [{ role: "showHelp" }],
  },
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
    y: 80,
  },
});

logger.info("Electrobun runtime started");
