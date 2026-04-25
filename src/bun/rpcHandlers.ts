import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Utils } from "electrobun/bun";
import type {
  ApprovalEventPayload,
  AppUpdateEventPayload,
  ChatStreamEventPayload,
  OrchestratorRPC,
  RespondToApprovalResult,
  RespondToPlanReviewResult,
  RespondToUserInputResult,
  SmokeEventPayload,
  SmokeProvider,
  UserInputEventPayload,
} from "../shared/AppRPC.ts";
import {
  inspectGitDiff,
  inspectGitDirectory,
  inspectGitFileDiff,
  listKnownGitBranches,
  switchGitBranch,
} from "./git.ts";
import type { ReplayFixtureHarness } from "./e2eHarness.ts";
import type { AppUpdaterManager } from "./appUpdaterManager.ts";
import type { ProviderRuntimeManager } from "./providerRuntime.ts";
import type { SessionReplayRecorder } from "./sessionReplay.ts";
import { createTimestamp } from "./sessionReplay.ts";
import type { createProviderModelCatalogStore } from "./providerModelCatalogStore.ts";
import type { createUILayoutStateStore } from "./uiLayoutStateStore.ts";
import type { PersistedUILayoutState } from "../shared/uiLayoutState.ts";
import {
  applyThinkingLevelPromptPrefix,
  splitProviderModelId,
} from "../shared/providerThinkingLevels.ts";
import { applyPlanModePromptPrefix } from "../shared/sessionModes.ts";

type RpcRequestSchema = OrchestratorRPC["bun"]["requests"];
type RpcRequestHandlers = {
  [K in keyof RpcRequestSchema]: RpcRequestSchema[K] extends {
    params: infer P;
    response: infer R;
  }
    ? (params: P) => R | Promise<R>
    : never;
};

export interface RpcHandlerDependencies {
  defaultWorkspaceCwd: string;
  replayFixtureHarness: ReplayFixtureHarness | undefined;
  providerRuntimeManager: ProviderRuntimeManager;
  providerModelCatalogStore: ReturnType<typeof createProviderModelCatalogStore>;
  appUpdaterManager: AppUpdaterManager;
  uiLayoutStateStore: ReturnType<typeof createUILayoutStateStore>;
  sessionReplay: SessionReplayRecorder;
  emitSmokeEvent(payload: SmokeEventPayload): void;
  emitChatStreamEvent(payload: ChatStreamEventPayload): void;
  emitApprovalEvent(payload: ApprovalEventPayload): void;
  emitUserInputEvent(payload: UserInputEventPayload): void;
  emitAppUpdateEvent?(payload: AppUpdateEventPayload): void;
  onUILayoutStateWritten?(state: PersistedUILayoutState): void;
  executeSmokeRun(runId: string, provider: SmokeProvider, prompt?: string, cwd?: string): void;
  runChatPrompt(
    runtime: Parameters<ProviderRuntimeManager["flushAssistantMessage"]>[0],
    requestId: string,
    message: string,
  ): void;
}

export function createRpcRequestHandlers(deps: RpcHandlerDependencies): RpcRequestHandlers {
  const {
    defaultWorkspaceCwd,
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
    onUILayoutStateWritten,
    executeSmokeRun,
    runChatPrompt,
  } = deps;

  return {
    getHomeDirectory: async () => ({
      path: replayFixtureHarness?.currentFixtureName
        ? replayFixtureHarness.getHomeDirectory()
        : homedir(),
    }),
    getUILayoutState: async () => ({
      state: await uiLayoutStateStore.read(),
    }),
    setUILayoutState: async ({ state }) => {
      await uiLayoutStateStore.write(state);
      const nextState = await uiLayoutStateStore.read();
      onUILayoutStateWritten?.(nextState);
      return {
        state: nextState,
      };
    },
    chooseWorkingDirectory: async ({ startingFolder }) => {
      const selectedPaths = await Utils.openFileDialog({
        startingFolder: startingFolder?.trim() || homedir(),
        canChooseFiles: false,
        canChooseDirectory: true,
        allowsMultipleSelection: false,
      });
      const selected = selectedPaths.find((entry) => entry.trim().length > 0);
      return { path: selected };
    },
    listDirectory: async ({ cwd }) => {
      if (replayFixtureHarness?.currentFixtureName) {
        return replayFixtureHarness.listDirectory(cwd);
      }
      const entries = await readdir(cwd, { withFileTypes: true });
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
    getGitFileDiff: async ({ cwd, path: filePath, originalPath }) =>
      replayFixtureHarness?.currentFixtureName
        ? replayFixtureHarness.getGitFileDiff(cwd, filePath, originalPath)
        : inspectGitFileDiff(cwd, filePath, originalPath),
    switchGitBranch: async ({ cwd, branch }) =>
      replayFixtureHarness?.currentFixtureName
        ? replayFixtureHarness.switchGitBranch(cwd, branch)
        : switchGitBranch(cwd, branch),
    getAvailableCommands: async ({ provider, sessionId }) => {
      const runtime = providerRuntimeManager.getRuntime(provider);
      const resolvedSessionId = sessionId?.trim() || runtime?.sessionId || "";
      const commands = runtime
        ? (runtime.availableCommandsBySession.get(resolvedSessionId) ?? [])
        : [];
      return { provider, sessionId: resolvedSessionId, commands };
    },
    getProviderModelCatalog: async ({ provider, cwd }) => {
      if (replayFixtureHarness?.currentFixtureName) {
        return replayFixtureHarness.getProviderModelCatalog(provider);
      }
      await providerRuntimeManager.ensureProviderRuntime(provider, cwd ?? defaultWorkspaceCwd);
      return { provider, catalog: providerModelCatalogStore.get(provider) };
    },
    getProviderSessionConfig: async ({ provider, sessionId, cwd }) => {
      if (replayFixtureHarness?.currentFixtureName) {
        return replayFixtureHarness.getProviderSessionConfig(provider, sessionId, cwd);
      }
      const runtime = await providerRuntimeManager.ensureProviderRuntime(
        provider,
        cwd ?? defaultWorkspaceCwd,
      );
      if (sessionId?.trim()) {
        await providerRuntimeManager.switchRuntimeSession(runtime, sessionId.trim());
      }
      return {
        provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        modeConfig: providerRuntimeManager.getSessionModeConfig(runtime),
      };
    },
    getAppUpdateState: async () => ({
      state: appUpdaterManager.getState(),
    }),
    checkForAppUpdates: async () => ({
      state: await appUpdaterManager.checkForUpdates(),
    }),
    applyAppUpdate: async () => ({
      state: await appUpdaterManager.applyUpdate(),
    }),
    createChatSession: async ({ provider, cwd, mode }) => {
      if (replayFixtureHarness?.currentFixtureName) {
        return replayFixtureHarness.createChatSession(provider, cwd, mode);
      }
      const runtimeCwd = cwd ?? defaultWorkspaceCwd;
      const existing = providerRuntimeManager.getRuntime(provider);
      if (!existing || existing.cwd !== runtimeCwd) {
        const runtime = await providerRuntimeManager.ensureProviderRuntime(provider, runtimeCwd);
        const modeConfig =
          mode && mode !== runtime.modeState.publicState.normalizedMode
            ? await providerRuntimeManager.setSessionMode(runtime, mode)
            : providerRuntimeManager.getSessionModeConfig(runtime);
        return { provider, sessionId: runtime.sessionId, cwd: runtime.cwd, modeConfig };
      }

      const runtime = existing;
      if (runtime.activeRequestId) {
        throw new Error(`${provider} is already processing a message.`);
      }

      const session = await providerRuntimeManager.createRuntimeSession(runtime);
      sessionReplay.writeMetadata({
        sessionId: session.sessionId,
        provider,
        cwd: runtime.cwd,
        mode: runtime.modeState.publicState.normalizedMode,
        transport: runtime.transportKind,
        currentModeId: session.replay.currentModeId,
        providerSessionId: session.replay.providerSessionId,
      });
      const modeConfig =
        mode && mode !== runtime.modeState.publicState.normalizedMode
          ? await providerRuntimeManager.setSessionMode(runtime, mode)
          : providerRuntimeManager.getSessionModeConfig(runtime);

      return { provider, sessionId: session.sessionId, cwd: runtime.cwd, modeConfig };
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

      executeSmokeRun(runId, provider, prompt, cwd);

      return { runId, provider, startedAt };
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
        cwd ?? defaultWorkspaceCwd,
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
      preparedRuntime.latestStructuredPlanText = undefined;
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
        mode: preparedRuntime.modeState.publicState.normalizedMode,
        transport: preparedRuntime.transportKind,
        currentModeId: preparedRuntime.currentModeId,
        providerSessionId: preparedRuntime.providerSessionIdsBySession.get(
          preparedRuntime.sessionId,
        ),
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

      const modeAwareMessage =
        preparedRuntime.modeState.publicState.normalizedMode === "plan"
          ? applyPlanModePromptPrefix(messageText)
          : messageText;
      const promptText = applyThinkingLevelPromptPrefix(thinkingLevel, modeAwareMessage);
      runChatPrompt(preparedRuntime, requestId, promptText);

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
        cwd ?? defaultWorkspaceCwd,
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

      providerRuntimeManager.resolvePendingApprovals(runtime, { outcome: "cancelled" });
      providerRuntimeManager.resolvePendingUserInputs(runtime, { outcome: "cancelled" });
      await runtime.adapter.cancelTurn({ sessionId: runtime.sessionId });

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
        return replayFixtureHarness.respondToApproval({ provider, approvalId, outcome });
      }
      const runtime = await providerRuntimeManager.ensureProviderRuntime(
        provider,
        cwd ?? defaultWorkspaceCwd,
      );
      const pendingApproval = runtime.pendingApprovals.get(approvalId);
      if (!pendingApproval) {
        throw new Error(`Unknown approval request: ${approvalId}`);
      }

      runtime.pendingApprovals.delete(approvalId);
      await runtime.adapter.respondToApproval(approvalId, outcome);
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
    setSessionMode: async ({ provider, sessionId, cwd, mode }) => {
      if (replayFixtureHarness?.currentFixtureName) {
        return replayFixtureHarness.setSessionMode(provider, sessionId, cwd, mode);
      }
      const runtime = await providerRuntimeManager.ensureProviderRuntime(
        provider,
        cwd ?? defaultWorkspaceCwd,
      );
      if (sessionId?.trim()) {
        await providerRuntimeManager.switchRuntimeSession(runtime, sessionId.trim());
      }
      const modeConfig = await providerRuntimeManager.setSessionMode(runtime, mode);
      return {
        provider,
        sessionId: runtime.sessionId,
        cwd: runtime.cwd,
        modeConfig,
      };
    },
    respondToPlanReview: async ({
      provider,
      reviewId,
      sessionId,
      cwd,
      decision,
    }): Promise<RespondToPlanReviewResult> => {
      if (replayFixtureHarness?.currentFixtureName) {
        return replayFixtureHarness.respondToPlanReview(
          provider,
          reviewId,
          sessionId,
          cwd,
          decision,
        );
      }
      const runtime = await providerRuntimeManager.ensureProviderRuntime(
        provider,
        cwd ?? defaultWorkspaceCwd,
      );
      if (sessionId?.trim()) {
        await providerRuntimeManager.switchRuntimeSession(runtime, sessionId.trim());
      }
      const result = await providerRuntimeManager.respondToPlanReview(runtime, reviewId, decision);
      return {
        provider,
        reviewId,
        sessionId: result.sessionId,
        cwd: result.cwd,
        decision,
        respondedAt: result.respondedAt,
      };
    },
    respondToUserInput: async ({
      provider,
      inputId,
      outcome,
      cwd,
    }): Promise<RespondToUserInputResult> => {
      if (replayFixtureHarness?.currentFixtureName) {
        throw new Error("Replay user input is not implemented.");
      }
      const runtime = await providerRuntimeManager.ensureProviderRuntime(
        provider,
        cwd ?? defaultWorkspaceCwd,
      );
      const pendingInput = runtime.pendingUserInputs.get(inputId);
      if (!pendingInput) {
        throw new Error(`Unknown user input request: ${inputId}`);
      }

      runtime.pendingUserInputs.delete(inputId);
      await runtime.adapter.respondToUserInput(inputId, outcome);
      const respondedAt = createTimestamp();
      emitUserInputEvent({
        kind: "resolved",
        inputId,
        provider,
        sessionId: pendingInput.sessionId,
        cwd: pendingInput.cwd,
        requestId: pendingInput.requestId,
        outcome,
        timestamp: respondedAt,
      });
      return {
        provider,
        inputId,
        sessionId: pendingInput.sessionId,
        cwd: pendingInput.cwd,
        outcome,
        respondedAt,
      };
    },
  };
}
