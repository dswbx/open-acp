import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationMenu, BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { normalizeDiscoveredProviderModels } from "./providerModelDiscovery.ts";
import { createProviderModelCatalogStore } from "./providerModelCatalogStore.ts";
import { SessionTranscriptStore } from "./SessionTranscriptStore.ts";
import { createSessionReplayRecorder, createTimestamp } from "./sessionReplay.ts";
import {
  createProviderRuntimeManager,
  createSmokeRunnerOptions,
  type ProviderRuntime,
} from "./providerRuntime.ts";
import { ReplayFixtureHarness, startE2EControlServer } from "./e2eHarness.ts";
import { RealAgentSmokeRunner } from "../cli/RealAgentSmoke.ts";

import type {
  AgentTranscriptEventPayload,
  ApprovalEventPayload,
  AvailableCommandsEventPayload,
  ChatStreamEventPayload,
  OrchestratorRPC,
  RespondToApprovalResult,
  SmokeEventPayload,
  SmokeFinishedPayload,
  SmokeProvider,
} from "../shared/AppRPC.ts";
import {
  inspectGitDiff,
  inspectGitDirectory,
  inspectGitFileDiff,
  listKnownGitBranches,
  switchGitBranch,
} from "./git.ts";
import { normalizeLogMessage } from "./acpHelpers.ts";
import { logger } from "../shared/logger.ts";
import {
  applyThinkingLevelPromptPrefix,
  splitProviderModelId,
} from "../shared/providerThinkingLevels.ts";

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
    requests: {
      getHomeDirectory: async () => ({
        path: replayFixtureHarness?.currentFixtureName
          ? replayFixtureHarness.getHomeDirectory()
          : homedir(),
      }),
      chooseWorkingDirectory: async ({ startingFolder }) => {
        const selectedPaths = await Utils.openFileDialog({
          startingFolder: startingFolder?.trim() || homedir(),
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });
        const path = selectedPaths.find((entry) => entry.trim().length > 0);
        return {
          path,
        };
      },
      listDirectory: async ({ cwd }) => {
        if (replayFixtureHarness?.currentFixtureName) {
          return replayFixtureHarness.listDirectory(cwd);
        }
        const entries = await readdir(cwd, {
          withFileTypes: true,
        });
        return {
          cwd,
          entries: entries
            .map(
              (entry) =>
                ({
                  name: entry.name,
                  path: path.join(cwd, entry.name),
                  kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
                }) as const,
            )
            .sort((left, right) => {
              if (left.kind !== right.kind) {
                return left.kind === "directory"
                  ? -1
                  : right.kind === "directory"
                    ? 1
                    : left.kind.localeCompare(right.kind);
              }
              return left.name.localeCompare(right.name, undefined, {
                numeric: true,
                sensitivity: "base",
              });
            }),
        };
      },
      getGitStatus: async ({ cwd }) =>
        replayFixtureHarness?.currentFixtureName
          ? replayFixtureHarness.getGitStatus(cwd)
          : inspectGitDirectory(cwd),
      getGitBranches: async ({ cwd }) =>
        replayFixtureHarness?.currentFixtureName
          ? replayFixtureHarness.getGitBranches(cwd)
          : listKnownGitBranches(cwd),
      getGitDiff: async ({ cwd }) =>
        replayFixtureHarness?.currentFixtureName
          ? replayFixtureHarness.getGitDiff(cwd)
          : inspectGitDiff(cwd),
      getGitFileDiff: async ({ cwd, path, originalPath }) =>
        replayFixtureHarness?.currentFixtureName
          ? replayFixtureHarness.getGitFileDiff(cwd, path, originalPath)
          : inspectGitFileDiff(cwd, path, originalPath),
      switchGitBranch: async ({ cwd, branch }) =>
        replayFixtureHarness?.currentFixtureName
          ? replayFixtureHarness.switchGitBranch(cwd, branch)
          : switchGitBranch(cwd, branch),
      getAvailableCommands: async ({ provider, sessionId, cwd }) => {
        const runtime = providerRuntimeManager.getRuntime(provider);
        const resolvedSessionId = sessionId?.trim() || runtime?.sessionId || "";
        const commands = runtime
          ? (runtime.availableCommandsBySession.get(resolvedSessionId) ?? [])
          : [];
        return {
          provider,
          sessionId: resolvedSessionId,
          commands,
        };
      },
      getProviderModelCatalog: async ({ provider, cwd }) => {
        if (replayFixtureHarness?.currentFixtureName) {
          return replayFixtureHarness.getProviderModelCatalog(provider);
        }
        await providerRuntimeManager.ensureProviderRuntime(provider, cwd ?? DEFAULT_WORKSPACE_CWD);
        return {
          provider,
          catalog: providerModelCatalogStore.get(provider),
        };
      },
      createChatSession: async ({ provider, cwd }) => {
        if (replayFixtureHarness?.currentFixtureName) {
          return replayFixtureHarness.createChatSession(provider, cwd);
        }
        const runtimeCwd = cwd ?? DEFAULT_WORKSPACE_CWD;
        const existing = providerRuntimeManager.getRuntime(provider);
        if (!existing || existing.cwd !== runtimeCwd) {
          const runtime = await providerRuntimeManager.ensureProviderRuntime(provider, runtimeCwd);
          return {
            provider,
            sessionId: runtime.sessionId,
            cwd: runtime.cwd,
          };
        }

        const runtime = existing;
        if (runtime.activeRequestId) {
          throw new Error(`${provider} is already processing a message.`);
        }

        const session = await runtime.client.createSession({
          cwd: runtime.cwd,
          mcpServers: [],
        });
        providerModelCatalogStore.recordDiscovery(
          provider,
          normalizeDiscoveredProviderModels(session),
          createTimestamp(),
        );
        runtime.sessionId = session.sessionId;
        runtime.currentModel = undefined;
        sessionReplay.writeMetadata({
          sessionId: session.sessionId,
          provider,
          cwd: runtime.cwd,
        });

        return {
          provider,
          sessionId: session.sessionId,
          cwd: runtime.cwd,
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
          timestamp: startedAt,
        });

        void executeSmokeRun(runId, provider, prompt, cwd);

        return {
          runId,
          provider,
          startedAt,
        };
      },
      sendChatMessage: async ({ provider, message, model, sessionId, cwd }) => {
        const messageText = message.trim();
        if (messageText.length === 0) {
          throw new Error("Message cannot be empty.");
        }

        if (replayFixtureHarness?.currentFixtureName) {
          return replayFixtureHarness.sendChatMessage({
            provider,
            message: messageText,
            model,
            sessionId,
            cwd,
          });
        }

        const requestedSessionId = sessionId?.trim();

        const selectedModel = model?.trim();
        const encodedModel = selectedModel && selectedModel.length > 0 ? selectedModel : undefined;
        const { baseModelId, thinkingLevel } = splitProviderModelId(provider, encodedModel);
        const resolvedModel = baseModelId.length > 0 ? baseModelId : encodedModel;

        const runtime = await providerRuntimeManager.ensureProviderRuntime(
          provider,
          cwd ?? DEFAULT_WORKSPACE_CWD,
        );
        if (runtime.activeRequestId) {
          throw new Error(`${provider} is already processing a message.`);
        }

        if (requestedSessionId && requestedSessionId.length > 0) {
          await providerRuntimeManager.switchRuntimeSession(runtime, requestedSessionId);
        }

        const preparedRuntime = await providerRuntimeManager.prepareRuntimeForModel(
          runtime,
          resolvedModel,
          requestedSessionId,
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
          text: "",
        });
        sessionReplay.writeMetadata({
          sessionId: preparedRuntime.sessionId,
          provider,
          cwd: preparedRuntime.cwd,
          model: resolvedModel,
        });

        sessionReplay.appendTranscriptRecord(preparedRuntime.sessionId, {
          timestamp: createTimestamp(),
          type: "user_message",
          payload: {
            requestId,
            provider,
            model: resolvedModel,
            text: messageText,
          },
        });

        emitChatStreamEvent({
          requestId,
          provider,
          sessionId: preparedRuntime.sessionId,
          cwd: preparedRuntime.cwd,
          kind: "session_ready",
          timestamp: createTimestamp(),
        });

        const promptText = applyThinkingLevelPromptPrefix(thinkingLevel, messageText);
        void runChatPrompt(preparedRuntime, requestId, promptText);

        return {
          requestId,
          provider,
          sessionId: preparedRuntime.sessionId,
          cwd: preparedRuntime.cwd,
          model: resolvedModel,
        };
      },
      cancelChatMessage: async ({ provider, requestId, sessionId, cwd }) => {
        if (replayFixtureHarness?.currentFixtureName) {
          return replayFixtureHarness.cancelChatMessage({
            provider,
            requestId,
            sessionId,
          });
        }
        const runtime = await providerRuntimeManager.ensureProviderRuntime(
          provider,
          cwd ?? DEFAULT_WORKSPACE_CWD,
        );
        if (sessionId?.trim()) {
          await providerRuntimeManager.switchRuntimeSession(runtime, sessionId.trim());
        }
        if (!runtime.activeRequestId) {
          throw new Error(`${provider} is not processing a message.`);
        }
        if (requestId && requestId !== runtime.activeRequestId) {
          throw new Error(
            `Active request mismatch: expected ${runtime.activeRequestId}, received ${requestId}.`,
          );
        }
        const activeRequestId = runtime.activeRequestId;

        providerRuntimeManager.resolvePendingApprovals(runtime, {
          outcome: "cancelled",
        });
        await runtime.client.cancel({
          sessionId: runtime.sessionId,
        });

        return {
          provider,
          requestId: activeRequestId,
          sessionId: runtime.sessionId,
          cwd: runtime.cwd,
          cancelledAt: createTimestamp(),
        };
      },
      respondToApproval: async ({
        provider,
        approvalId,
        outcome,
        cwd,
      }): Promise<RespondToApprovalResult> => {
        if (replayFixtureHarness?.currentFixtureName) {
          return replayFixtureHarness.respondToApproval({
            provider,
            approvalId,
            outcome,
          });
        }
        const runtime = await providerRuntimeManager.ensureProviderRuntime(
          provider,
          cwd ?? DEFAULT_WORKSPACE_CWD,
        );
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
          timestamp: respondedAt,
        });

        return {
          provider,
          approvalId,
          sessionId: pendingApproval.sessionId,
          cwd: pendingApproval.cwd,
          outcome,
          respondedAt,
        };
      },
    },
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
