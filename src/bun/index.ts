import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationMenu, BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { createAppUpdaterManager } from "./appUpdaterManager.ts";
import { createProviderModelCatalogStore } from "./providerModelCatalogStore.ts";
import { SessionTranscriptStore } from "./SessionTranscriptStore.ts";
import { createSessionReplayRecorder, createTimestamp } from "./sessionReplay.ts";
import { createUILayoutStateStore } from "./uiLayoutStateStore.ts";
import {
  createProviderRuntimeManager,
  createSmokeRunnerOptions,
  type ProviderRuntime,
} from "./providerRuntime.ts";
import { createRpcRequestHandlers } from "./rpcHandlers.ts";
import { ReplayFixtureHarness, startE2EControlServer } from "./e2eHarness.ts";
import { RealAgentSmokeRunner } from "../cli/RealAgentSmoke.ts";
import { createWindowStateStore, type PersistedWindowState } from "./windowStateStore.ts";

import type {
  AgentTranscriptEventPayload,
  ApprovalEventPayload,
  AvailableCommandsEventPayload,
  AppUpdateEventPayload,
  ChatStreamEventPayload,
  OrchestratorRPC,
  SmokeEventPayload,
  SmokeFinishedPayload,
  SmokeProvider,
  UserInputEventPayload,
} from "../shared/AppRPC.ts";

import { normalizeLogMessage } from "./acpHelpers.ts";
import { logger } from "../shared/logger.ts";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DEFAULT_PROMPT = "Reply with one short sentence.";
const APP_NAME = "Agent Orchestrator";
const E2E_MODE_ENABLED = process.env.ACP_E2E === "1";
const E2E_CONTROL_PORT = Number.parseInt(process.env.ACP_E2E_PORT ?? "47831", 10);

type MainWindowRpcSendApi = {
  smokeEvent: (payload: SmokeEventPayload) => void;
  smokeFinished: (payload: SmokeFinishedPayload) => void;
  chatStreamEvent: (payload: ChatStreamEventPayload) => void;
  approvalEvent: (payload: ApprovalEventPayload) => void;
  userInputEvent: (payload: UserInputEventPayload) => void;
  availableCommandsEvent: (payload: AvailableCommandsEventPayload) => void;
  agentTranscriptEvent: (payload: AgentTranscriptEventPayload) => void;
  appUpdateEvent: (payload: AppUpdateEventPayload) => void;
};
const providerModelCatalogStore = createProviderModelCatalogStore();
const uiLayoutStateStore = createUILayoutStateStore();
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
    userInput: (payload) => emitUserInputEvent(payload),
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
const appUpdaterManager = createAppUpdaterManager({
  updater: Updater,
});

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
  getMainWindowSendApi()?.smokeEvent(payload);
}

function emitSmokeFinished(payload: SmokeFinishedPayload): void {
  getMainWindowSendApi()?.smokeFinished(payload);
}

function emitChatStreamEvent(payload: ChatStreamEventPayload): void {
  getMainWindowSendApi()?.chatStreamEvent(payload);
  sessionReplay.appendEvent(payload.sessionId, {
    type: "chatStreamEvent",
    payload,
  });
}

function emitApprovalEvent(payload: ApprovalEventPayload): void {
  getMainWindowSendApi()?.approvalEvent(payload);
  sessionReplay.appendEvent(payload.sessionId, {
    type: "approvalEvent",
    payload,
  });
}

function emitUserInputEvent(payload: UserInputEventPayload): void {
  getMainWindowSendApi()?.userInputEvent(payload);
}

function emitAvailableCommandsEvent(payload: AvailableCommandsEventPayload): void {
  getMainWindowSendApi()?.availableCommandsEvent(payload);
}

function emitAgentTranscriptEvent(payload: AgentTranscriptEventPayload): void {
  getMainWindowSendApi()?.agentTranscriptEvent(payload);
  if (payload.sessionId) {
    sessionReplay.appendEvent(payload.sessionId, {
      type: "agentTranscriptEvent",
      payload,
    });
  }
}

function emitAppUpdateEvent(payload: AppUpdateEventPayload): void {
  getMainWindowSendApi()?.appUpdateEvent(payload);
}

function getMainWindowSendApi(): MainWindowRpcSendApi | undefined {
  return mainWindow?.webview.rpc?.send;
}

async function runChatPrompt(
  runtime: ProviderRuntime,
  requestId: string,
  message: string,
): Promise<void> {
  try {
    const result = await runtime.adapter.sendPrompt({
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
    if (runtime.pendingUserInputs.size > 0) {
      providerRuntimeManager.resolvePendingUserInputs(runtime, {
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
      appUpdaterManager,
      uiLayoutStateStore,
      sessionReplay,
      emitSmokeEvent,
      emitChatStreamEvent,
      emitApprovalEvent,
      emitUserInputEvent,
      executeSmokeRun: (runId, provider, prompt, cwd) => {
        void executeSmokeRun(runId, provider, prompt, cwd);
      },
      runChatPrompt: (runtime, requestId, message) => {
        void runChatPrompt(runtime, requestId, message);
      },
    }),
  },
});

type MainWindowType = BrowserWindow<typeof rpc>;

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
const MAIN_WINDOW_MIN_WIDTH = 800;
const MAIN_WINDOW_MIN_HEIGHT = 600;
const DEFAULT_MAIN_WINDOW_FRAME = {
  width: 1280,
  height: 820,
  x: 120,
  y: 80,
} as const;
const windowStateStore = createWindowStateStore({
  minWidth: MAIN_WINDOW_MIN_WIDTH,
  minHeight: MAIN_WINDOW_MIN_HEIGHT,
});
const initialWindowState = windowStateStore.read();

function toWindowFrame(windowState: PersistedWindowState | typeof DEFAULT_MAIN_WINDOW_FRAME) {
  return {
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
  };
}

function createPersistedWindowState(
  frame: { x: number; y: number; width: number; height: number },
  isMaximized: boolean,
): PersistedWindowState {
  return {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    isMaximized,
  };
}

let lastNormalWindowFrame = toWindowFrame(initialWindowState ?? DEFAULT_MAIN_WINDOW_FRAME);

function buildApplicationMenu() {
  const appUpdateState = appUpdaterManager.getState();
  const divider = { type: "divider" as const };
  return [
    {
      label: APP_NAME,
      submenu: [
        { role: "about" },
        divider,
        {
          label: appUpdateState.updateReady ? "Restart to Update" : "Check for Updates",
          action: appUpdateState.updateReady ? "app:update:apply" : "app:update:check",
          enabled: appUpdateState.updateReady ? appUpdateState.canApply : appUpdateState.canCheck,
        },
        divider,
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        divider,
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        divider,
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
        divider,
        { role: "close" },
        { role: "bringAllToFront" },
      ],
    },
    {
      label: "Help",
      submenu: [{ role: "showHelp" }],
    },
  ];
}

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

ApplicationMenu.setApplicationMenu(buildApplicationMenu());
ApplicationMenu.on("application-menu-clicked", (event) => {
  const action = (event as { data?: { action?: string } }).data?.action;
  if (action === "app:update:check") {
    void appUpdaterManager.checkForUpdates();
  }
  if (action === "app:update:apply") {
    void appUpdaterManager.applyUpdate();
  }
});

appUpdaterManager.subscribe((entry, state) => {
  ApplicationMenu.setApplicationMenu(buildApplicationMenu());
  emitAppUpdateEvent({
    entry,
    state,
  });
});

const mainWindow: MainWindowType = new BrowserWindow({
  title: APP_NAME,
  url: viewUrl,
  rpc,
  titleBarStyle: "hiddenInset",
  renderer: "native",
  frame: toWindowFrame(initialWindowState ?? DEFAULT_MAIN_WINDOW_FRAME),
});

if (initialWindowState?.isMaximized) {
  mainWindow.maximize();
}

function persistMainWindowState(): void {
  if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
    lastNormalWindowFrame = mainWindow.getFrame();
  }

  windowStateStore.scheduleWrite(
    createPersistedWindowState(lastNormalWindowFrame, mainWindow.isMaximized()),
  );
}

// @todo: current workaround for missing minimum size support in electrobun
mainWindow.on("resize", (event) => {
  const { width, height } = (event as { data: { width: number; height: number } }).data;
  const nextWidth = Math.max(width, MAIN_WINDOW_MIN_WIDTH);
  const nextHeight = Math.max(height, MAIN_WINDOW_MIN_HEIGHT);

  if (nextWidth !== width || nextHeight !== height) {
    mainWindow.setSize(nextWidth, nextHeight);
  }

  persistMainWindowState();
});

mainWindow.on("move", () => {
  persistMainWindowState();
});

mainWindow.on("maximize", () => {
  persistMainWindowState();
});

mainWindow.on("unmaximize", () => {
  persistMainWindowState();
});

mainWindow.on("close", () => {
  void windowStateStore.write(
    createPersistedWindowState(lastNormalWindowFrame, mainWindow.isMaximized()),
  );
});

logger.info("Electrobun runtime started");
void appUpdaterManager.initialize();
