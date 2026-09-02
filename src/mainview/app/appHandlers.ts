import type {
  ApprovalOutcome,
  GetGitStatusResult,
  NormalizedSessionMode,
  PlanReviewDecision,
  SmokeProvider,
  StoredSessionSummary,
  UserInputOutcome,
} from "../../shared/AppRPC.ts";
import type { RecordedSession } from "../../shared/sessionRecording.ts";
import type { ChatMessage } from "../chat/types.ts";
import type { ChatToolCallState } from "../../shared/AppRPC.ts";
import { formatToolPresentation, toToolActionLabel } from "../chat/toolPresentation.ts";
import {
  appendReasoningBlock,
  appendReasoningStepBlock,
  appendTextBlock,
  createAssistantMessage,
  finalizeTrailingReasoningBlock,
  getCompletedAssistantText,
  upsertToolBlock,
} from "../chat/chatBlockMutations.ts";
import type { SmokeBridge, SmokeBridgeEvent } from "../bridge/SmokeBridge.ts";
import { useApprovalStore } from "../state/approvalStore.ts";
import { useAppUpdateStore } from "../state/appUpdateStore.ts";
import { useChatStore } from "../state/chatStore.ts";
import { useDirectoryStore } from "../state/directoryStore.ts";
import { useLoggingStore, type SmokeLogLine } from "../state/loggingStore.ts";
import { useProviderModelStore } from "../state/providerModelStore.ts";
import { useRightSidebarStore } from "../state/rightSidebarStore.ts";
import { useSessionCreationStore } from "../state/sessionCreationStore.ts";
import { useAppSettingsStore } from "../state/appSettingsStore.ts";
import { useSessionStore, type ChatSession } from "../state/sessionStore.ts";
import { useWorkspaceCreationStore } from "../state/workspaceCreationStore.ts";
import { useWorkspaceStore } from "../state/workspaceStore.ts";
import { useUserInputStore } from "../state/userInputStore.ts";
import { getSelectedModelValue } from "../providerModelCatalogState.ts";
import { extractPlanReviewContent } from "../../shared/planReview.ts";
import {
  createDefaultProviderSessionModeConfig,
  providerSupportsPlanMode,
} from "../../shared/sessionModes.ts";
import {
  formatGitSessionSummary,
  getGitBranchLabel,
  hydrateGitStatus,
  reconcileGitTabForActiveSession,
  useGitStore,
} from "../features/git/index.ts";
import { useContextStore } from "../features/context/index.ts";
import { usePlanReviewStore, useSessionModeStore } from "../features/modes/index.ts";
import { createChatMessagesFromRecording } from "./recordingChatMessages.ts";

export function upsertAssistantMessage(
  messages: readonly ChatMessage[],
  requestId: string,
  sessionId: string,
  provider: SmokeProvider,
  updater: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const existingIndex = messages.findIndex(
    (message) => message.requestId === requestId && message.author === "assistant",
  );
  if (existingIndex < 0) {
    return [...messages, updater(createAssistantMessage(requestId, sessionId, provider))];
  }
  const nextMessages = [...messages];
  nextMessages[existingIndex] = updater(nextMessages[existingIndex]);
  return nextMessages;
}

export function upsertSession(
  sessions: readonly ChatSession[],
  session: ChatSession,
): ChatSession[] {
  const existingIndex = sessions.findIndex((item) => item.id === session.id);
  if (existingIndex < 0) {
    return [session, ...sessions];
  }
  const next = [...sessions];
  next[existingIndex] = {
    ...next[existingIndex],
    ...session,
    createdAt: next[existingIndex]?.createdAt ?? session.createdAt,
    title: next[existingIndex]?.title ?? session.title,
  };
  return next;
}

export function createSessionListItem(
  provider: SmokeProvider,
  sessionId: string,
  cwd: string,
  workspaceId?: string,
  model?: string,
  gitStatus?: GetGitStatusResult,
  createdAt = new Date().toISOString(),
  title?: string,
  lastTurnAt?: string,
): ChatSession {
  return {
    id: sessionId,
    workspaceId,
    provider,
    title: title?.trim() || `Session ${sessionId.slice(0, 8)}`,
    model: model?.trim() || "default",
    contextWindow: "live session",
    cwd,
    createdAt,
    lastTurnAt: lastTurnAt ?? createdAt,
    gitBranch: gitStatus ? getGitBranchLabel(gitStatus) : undefined,
    gitStatusSummary: gitStatus ? formatGitSessionSummary(gitStatus) : undefined,
  };
}

export function getSessionById(sessionId?: string): ChatSession | undefined {
  if (!sessionId) return undefined;
  return useSessionStore.getState().sessions.find((session) => session.id === sessionId);
}

export function getSessionCwd(sessionId?: string): string | undefined {
  return getSessionById(sessionId)?.cwd;
}

export function getActiveProvider(): SmokeProvider {
  const activeSession = getSessionById(useSessionStore.getState().activeSessionId);
  return activeSession?.provider ?? useSessionStore.getState().selectedProvider;
}

export function getLastUserMessage(sessionId?: string): ChatMessage | undefined {
  if (!sessionId) return undefined;
  const messages = useChatStore.getState().chatMessages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.sessionId === sessionId && message.author === "user") {
      return message;
    }
  }
  return undefined;
}

export function appendLog(input: Omit<SmokeLogLine, "id">): void {
  useLoggingStore.getState().appendLog(input);
}

export function resetReplayAppState(): void {
  const homeDirectory = useDirectoryStore.getState().homeDirectory;
  useChatStore.getState().reset();
  useApprovalStore.getState().reset();
  useUserInputStore.getState().reset();
  useLoggingStore.getState().reset();
  useContextStore.getState().reset();
  useGitStore.getState().reset();
  usePlanReviewStore.getState().reset();
  useSessionModeStore.getState().reset();
  useDirectoryStore.getState().reset();
  useProviderModelStore.getState().reset();
  useSessionStore.getState().reset();
  useSessionCreationStore.getState().reset(homeDirectory ?? "");
  useWorkspaceStore.getState().reset();
  useWorkspaceCreationStore.getState().resetDraft(homeDirectory ?? "");
  useRightSidebarStore.getState().reset();
}

export function reconcileActiveSessionSidebarState(params: {
  bridge: SmokeBridge;
  previousActiveSessionId?: string;
  previousActiveCwd: string;
  filesAutoOpenedSessions: Set<string>;
  gitAutoOpenedSessions: Set<string>;
}): void {
  const { bridge, previousActiveSessionId, previousActiveCwd, filesAutoOpenedSessions } = params;
  const nextActiveSessionId = useSessionStore.getState().activeSessionId;
  const activeCwd = getSessionById(nextActiveSessionId)?.cwd ?? "";
  const sidebarState = useRightSidebarStore.getState();

  if (activeCwd.length > 0 && activeCwd !== previousActiveCwd) {
    if (sidebarState.openTabs.includes("files")) {
      void hydrateSessionDirectory(bridge, activeCwd);
    }
    void hydrateGitStatus(bridge, activeCwd, { force: true });
  }

  if (
    nextActiveSessionId &&
    activeCwd.length > 0 &&
    !filesAutoOpenedSessions.has(nextActiveSessionId)
  ) {
    filesAutoOpenedSessions.add(nextActiveSessionId);
    if (!sidebarState.openTabs.includes("files")) {
      useRightSidebarStore.getState().openTab("files");
      void hydrateSessionDirectory(bridge, activeCwd);
    }
  }

  reconcileGitTabForActiveSession(params.gitAutoOpenedSessions);

  if (
    nextActiveSessionId &&
    nextActiveSessionId !== previousActiveSessionId &&
    useRightSidebarStore.getState().availableCommandsBySession[nextActiveSessionId] === undefined
  ) {
    void hydrateAvailableCommands(bridge);
  }
}

export async function hydrateHomeDirectory(bridge: SmokeBridge): Promise<void> {
  if (!bridge.isAvailable()) return;
  try {
    const result = await bridge.getHomeDirectory();
    useDirectoryStore.getState().setHomeDirectory(result.path);
    const creationStore = useSessionCreationStore.getState();
    if (creationStore.newSessionCwd.trim().length === 0) {
      creationStore.setNewSessionCwd(result.path);
    }
    const workspaceCreationStore = useWorkspaceCreationStore.getState();
    if (workspaceCreationStore.workspaceRootPath.trim().length === 0) {
      workspaceCreationStore.setWorkspaceRootPath(result.path);
    }
  } catch (error) {
    appendLog({
      provider: useSessionStore.getState().selectedProvider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to load the home directory.",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function hydrateWorkspaces(bridge: SmokeBridge): Promise<void> {
  if (!bridge.isAvailable()) return;
  try {
    const result = await bridge.listWorkspaces();
    useWorkspaceStore.getState().setWorkspaces(result.workspaces);
  } catch (error) {
    appendLog({
      provider: useSessionStore.getState().selectedProvider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to load workspaces.",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function hydrateStoredSessions(bridge: SmokeBridge): Promise<void> {
  if (!bridge.isAvailable()) return;
  try {
    const result = await bridge.listStoredSessions();
    useSessionStore
      .getState()
      .setSessions(() =>
        result.sessions.map((session) =>
          createSessionListItem(
            session.provider,
            session.sessionId,
            session.cwd,
            session.workspaceId,
            session.model,
            undefined,
            session.createdAt ?? session.updatedAt,
            session.title,
            session.updatedAt,
          ),
        ),
      );
    for (const session of result.sessions) {
      useSessionModeStore.getState().upsertModeConfig(createStoredSessionModeConfig(session));
    }
  } catch (error) {
    appendLog({
      provider: useSessionStore.getState().selectedProvider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to load stored sessions.",
      timestamp: new Date().toISOString(),
    });
  }
}

function createStoredSessionModeConfig(session: StoredSessionSummary) {
  return createDefaultProviderSessionModeConfig(
    session.provider,
    session.sessionId,
    session.cwd,
    session.mode === "plan" ? "plan" : "build",
  );
}

async function hydrateStoredSessionRecording(
  bridge: SmokeBridge,
  session: ChatSession,
): Promise<void> {
  if (!bridge.isAvailable()) return;
  try {
    const { recording } = await bridge.getStoredSessionRecording(session.id, session.workspaceId);
    applyStoredSessionRecording(recording, session);
  } catch (error) {
    appendLog({
      provider: session.provider,
      level: "error",
      message:
        error instanceof Error
          ? error.message
          : `Failed to load stored session ${session.id.slice(0, 8)}.`,
      timestamp: new Date().toISOString(),
    });
  }
}

function applyStoredSessionRecording(
  recording: RecordedSession,
  fallbackSession: ChatSession,
): void {
  const sessionId = readString(recording.metadata.sessionId) ?? fallbackSession.id;
  const provider = readProvider(recording.metadata.provider) ?? fallbackSession.provider;
  const cwd = readString(recording.metadata.cwd) ?? fallbackSession.cwd;
  const model = readString(recording.metadata.model) ?? normalizeStoredModel(fallbackSession.model);
  const mode = recording.metadata.mode === "plan" ? "plan" : "build";

  if (model) {
    useProviderModelStore.getState().setSelectedModel(provider, model);
  }
  useSessionModeStore
    .getState()
    .upsertModeConfig(createDefaultProviderSessionModeConfig(provider, sessionId, cwd, mode));
  useChatStore.getState().setChatMessages((previousMessages) => [
    ...previousMessages.filter((message) => message.sessionId !== sessionId),
    ...createChatMessagesFromRecording(recording, {
      sessionId,
      provider,
      cwd,
      model,
      idPrefix: "stored",
    }),
  ]);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readProvider(value: unknown): SmokeProvider | undefined {
  return value === "claude" || value === "opencode" || value === "qwen" || value === "codex"
    ? value
    : undefined;
}

function normalizeStoredModel(model: string | undefined): string | undefined {
  return model && model !== "default" ? model : undefined;
}

export async function hydrateAppUpdateState(bridge: SmokeBridge): Promise<void> {
  if (!bridge.isAvailable()) {
    return;
  }

  try {
    const result = await bridge.getAppUpdateState();
    useAppUpdateStore.getState().setState(result.state);
  } catch {
    // Keep the updater UI hidden in unsupported environments.
  }
}

export async function hydrateSessionDirectory(bridge: SmokeBridge, cwd?: string): Promise<void> {
  const trimmedCwd = cwd?.trim();
  if (!trimmedCwd || !bridge.isAvailable()) return;
  const directoryStore = useDirectoryStore.getState();
  if (directoryStore.loadingByCwd[trimmedCwd]) return;
  directoryStore.beginLoad(trimmedCwd);
  try {
    const result = await bridge.listDirectory(trimmedCwd);
    useDirectoryStore.getState().completeLoad(trimmedCwd, result.entries);
  } catch (error) {
    useDirectoryStore
      .getState()
      .failLoad(
        trimmedCwd,
        error instanceof Error ? error.message : "Failed to load directory contents.",
      );
  }
}

export async function hydrateProviderModelCatalog(
  bridge: SmokeBridge,
  provider: SmokeProvider,
  workspaceId?: string,
  cwd?: string,
): Promise<void> {
  if (!bridge.isAvailable()) return;
  try {
    const result = await bridge.getProviderModelCatalog(provider, workspaceId, cwd);
    useProviderModelStore.getState().setCatalog(provider, result.catalog);
  } catch (error) {
    appendLog({
      provider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to load provider model catalog.",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function hydrateSessionModeConfig(
  bridge: SmokeBridge,
  provider: SmokeProvider,
  sessionId?: string,
  workspaceId?: string,
  cwd?: string,
): Promise<void> {
  const trimmedSessionId = sessionId?.trim();
  if (!trimmedSessionId || !bridge.isAvailable()) {
    return;
  }

  try {
    const result = await bridge.getProviderSessionConfig(
      provider,
      trimmedSessionId,
      workspaceId,
      cwd,
    );
    useSessionModeStore.getState().upsertModeConfig(result.modeConfig);
  } catch (error) {
    appendLog({
      provider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to load session mode state.",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function hydrateAvailableCommands(bridge: SmokeBridge): Promise<void> {
  const activeSession = getSessionById(useSessionStore.getState().activeSessionId);
  if (!activeSession) return;
  if (!bridge.isAvailable()) return;
  try {
    const result = await bridge.getAvailableCommands(
      activeSession.provider,
      activeSession.id,
      activeSession.workspaceId,
      activeSession.cwd,
    );
    if (!result.sessionId) return;
    useRightSidebarStore.getState().setAvailableCommandsIfAbsent(result.sessionId, result.commands);
  } catch {
    // ignore — no cached commands yet
  }
}

export function handleOpenNewSessionDialog(workspaceId?: string): void {
  const creationStore = useSessionCreationStore.getState();
  if (
    useChatStore.getState().activeRequestId ||
    useChatStore.getState().isSending ||
    creationStore.isCreatingSession
  ) {
    return;
  }
  const activeSession = getSessionById(useSessionStore.getState().activeSessionId);
  const targetWorkspaceId = workspaceId ?? activeSession?.workspaceId;
  const workspace = targetWorkspaceId
    ? useWorkspaceStore.getState().workspaces.find((item) => item.id === targetWorkspaceId)
    : undefined;
  const settingsGeneral = useAppSettingsStore.getState().settings.general;
  const nextProvider = workspaceId
    ? (workspace?.defaultProvider ?? settingsGeneral.defaultProvider)
    : (activeSession?.provider ??
      workspace?.defaultProvider ??
      useSessionStore.getState().selectedProvider);
  const nextCwd = (() => {
    if (workspace?.rootPath) return workspace.rootPath;
    if (activeSession?.cwd) return activeSession.cwd;
    if (creationStore.newSessionCwd.trim().length > 0) return creationStore.newSessionCwd;
    return useDirectoryStore.getState().homeDirectory ?? "";
  })();
  const activeModeConfig =
    activeSession?.id && useSessionModeStore.getState().configsBySessionId[activeSession.id]
      ? useSessionModeStore.getState().configsBySessionId[activeSession.id]?.normalizedMode
      : undefined;
  const nextMode = workspaceId
    ? (workspace?.defaultSessionMode ?? settingsGeneral.defaultSessionMode)
    : (activeModeConfig ?? workspace?.defaultSessionMode ?? settingsGeneral.defaultSessionMode);
  creationStore.openDialog(nextProvider, nextCwd, workspace?.id);
  creationStore.setNewSessionMode(providerSupportsPlanMode(nextProvider) ? nextMode : "build");
}

export function handleOpenNewWorkspaceDialog(): void {
  const creationStore = useWorkspaceCreationStore.getState();
  const settingsGeneral = useAppSettingsStore.getState().settings.general;
  creationStore.resetDraft(
    useDirectoryStore.getState().homeDirectory ?? creationStore.workspaceRootPath,
  );
  creationStore.setWorkspaceProvider(settingsGeneral.defaultProvider);
  creationStore.setWorkspaceMode(settingsGeneral.defaultSessionMode);
  creationStore.setIsNewWorkspaceDialogOpen(true);
}

export function handleNewSessionDialogOpenChange(open: boolean): void {
  const creationStore = useSessionCreationStore.getState();
  if (creationStore.isCreatingSession && !open) return;
  creationStore.setIsNewSessionDialogOpen(open);
}

export async function handleChooseWorkingDirectory(bridge: SmokeBridge): Promise<void> {
  const creationStore = useSessionCreationStore.getState();
  if (creationStore.isChoosingWorkingDirectory || !bridge.isAvailable()) return;
  creationStore.setIsChoosingWorkingDirectory(true);
  try {
    const result = await bridge.chooseWorkingDirectory(
      creationStore.newSessionCwd.trim() || useDirectoryStore.getState().homeDirectory,
    );
    const nextStore = useSessionCreationStore.getState();
    nextStore.setIsChoosingWorkingDirectory(false);
    const trimmed = result.path?.trim();
    if (trimmed) nextStore.setNewSessionCwd(trimmed);
  } catch (error) {
    useSessionCreationStore.getState().setIsChoosingWorkingDirectory(false);
    appendLog({
      provider: useSessionCreationStore.getState().newSessionProvider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to choose a working directory.",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleChooseWorkspaceDirectory(bridge: SmokeBridge): Promise<void> {
  const creationStore = useWorkspaceCreationStore.getState();
  if (creationStore.isChoosingWorkspaceDirectory || !bridge.isAvailable()) return;
  creationStore.setIsChoosingWorkspaceDirectory(true);
  try {
    const result = await bridge.chooseWorkingDirectory(
      creationStore.workspaceRootPath.trim() || useDirectoryStore.getState().homeDirectory,
    );
    const nextStore = useWorkspaceCreationStore.getState();
    nextStore.setIsChoosingWorkspaceDirectory(false);
    const trimmed = result.path?.trim();
    if (trimmed) {
      nextStore.setWorkspaceRootPath(trimmed);
      if (nextStore.workspaceName.trim().length === 0) {
        nextStore.setWorkspaceName(trimmed.split("/").filter(Boolean).pop() ?? "");
      }
    }
  } catch (error) {
    useWorkspaceCreationStore.getState().setIsChoosingWorkspaceDirectory(false);
    appendLog({
      provider: useWorkspaceCreationStore.getState().workspaceProvider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to choose a workspace folder.",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleCreateWorkspace(bridge: SmokeBridge): Promise<void> {
  const workspaceCreation = useWorkspaceCreationStore.getState();
  if (
    useChatStore.getState().activeRequestId ||
    useChatStore.getState().isSending ||
    workspaceCreation.isCreatingWorkspace
  ) {
    return;
  }
  if (!bridge.isAvailable()) {
    appendLog({
      provider: workspaceCreation.workspaceProvider,
      level: "error",
      message: "Electrobun bridge is unavailable. Launch the app with the Electrobun runtime.",
      timestamp: new Date().toISOString(),
    });
    return;
  }
  const name = workspaceCreation.workspaceName.trim();
  const rootPath = workspaceCreation.workspaceRootPath.trim();
  if (!name || !rootPath) return;

  workspaceCreation.setIsCreatingWorkspace(true);
  try {
    const { workspace } = await bridge.createWorkspace({
      name,
      rootPath,
      defaultProvider: workspaceCreation.workspaceProvider,
      defaultSessionMode: workspaceCreation.workspaceMode,
    });
    useWorkspaceStore.getState().upsertWorkspace(workspace);
    useWorkspaceCreationStore.setState({
      isCreatingWorkspace: false,
      isNewWorkspaceDialogOpen: false,
    });
    useSessionCreationStore.setState({
      newSessionWorkspaceId: workspace.id,
      newSessionProvider: workspaceCreation.workspaceProvider,
      newSessionCwd: workspace.rootPath,
      newSessionMode: providerSupportsPlanMode(workspaceCreation.workspaceProvider)
        ? workspaceCreation.workspaceMode
        : "build",
    });
    await handleCreateSession(bridge);
  } catch (error) {
    useWorkspaceCreationStore.getState().setIsCreatingWorkspace(false);
    appendLog({
      provider: workspaceCreation.workspaceProvider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to create workspace.",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleCreateSession(bridge: SmokeBridge): Promise<void> {
  const creationStore = useSessionCreationStore.getState();
  if (
    useChatStore.getState().activeRequestId ||
    useChatStore.getState().isSending ||
    creationStore.isCreatingSession
  ) {
    return;
  }
  const provider = creationStore.newSessionProvider;
  const workspaceId = creationStore.newSessionWorkspaceId;
  const cwd = creationStore.newSessionCwd.trim();
  const mode = creationStore.newSessionMode;
  if (cwd.length === 0) return;
  useSessionStore.getState().applySessionTransition({
    draftProvider: provider,
    selectedProvider: provider,
    isDraftingSession: false,
  });
  if (!bridge.isAvailable()) {
    appendLog({
      provider,
      level: "error",
      message: "Electrobun bridge is unavailable. Launch the app with the Electrobun runtime.",
      timestamp: new Date().toISOString(),
    });
    return;
  }
  creationStore.setIsCreatingSession(true);
  try {
    const created = await bridge.createChatSession(provider, workspaceId, cwd, mode);
    useSessionCreationStore.setState({
      isCreatingSession: false,
      isNewSessionDialogOpen: false,
      newSessionProvider: created.provider,
      newSessionCwd: created.cwd,
      newSessionMode: created.modeConfig.normalizedMode,
    });
    useSessionModeStore.getState().upsertModeConfig(created.modeConfig);
    useSessionStore.getState().applySessionTransition({
      isDraftingSession: false,
      draftProvider: created.provider,
      selectedProvider: created.provider,
      activeSessionId: created.sessionId,
      sessions: (previousSessions) =>
        upsertSession(
          previousSessions,
          createSessionListItem(
            created.provider,
            created.sessionId,
            created.cwd,
            created.workspaceId ?? workspaceId,
            getSelectedModelValue(
              useProviderModelStore.getState().selected[created.provider],
              useProviderModelStore.getState().catalogs[created.provider],
            ),
            useGitStore.getState().statusByCwd[created.cwd],
          ),
        ),
    });
    void hydrateGitStatus(bridge, created.cwd, { force: true });
    void hydrateProviderModelCatalog(bridge, created.provider, created.workspaceId, created.cwd);
    appendLog({
      provider: created.provider,
      level: "info",
      message: `Created ${created.modeConfig.normalizedMode} session ${created.sessionId.slice(0, 8)} in ${created.cwd}.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create session.";
    useSessionCreationStore.getState().setIsCreatingSession(false);
    appendLog({
      provider,
      level: "error",
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function handleSelectWorkspace(workspaceId: string): void {
  if (
    useChatStore.getState().activeRequestId ||
    useChatStore.getState().isSending ||
    useSessionCreationStore.getState().isCreatingSession
  ) {
    return;
  }
  useWorkspaceStore.getState().setActiveWorkspaceId(workspaceId);
}

export function handleSelectSession(bridge: SmokeBridge, sessionId: string): void {
  if (
    useChatStore.getState().activeRequestId ||
    useChatStore.getState().isSending ||
    useSessionCreationStore.getState().isCreatingSession
  ) {
    return;
  }
  const selected = useSessionStore.getState().sessions.find((session) => session.id === sessionId);
  if (!selected) return;
  useSessionStore.getState().applySessionTransition({
    activeSessionId: selected.id,
    isDraftingSession: false,
    selectedProvider: selected.provider,
  });
  if (selected.workspaceId) {
    useWorkspaceStore.getState().setActiveWorkspaceId(selected.workspaceId);
  }
  if (selected.model && selected.model !== "default") {
    useProviderModelStore.getState().setSelectedModel(selected.provider, selected.model);
  }
  void hydrateGitStatus(bridge, selected.cwd, { force: true });
  void hydrateStoredSessionRecording(bridge, selected);
  void (async () => {
    await hydrateSessionModeConfig(
      bridge,
      selected.provider,
      selected.id,
      selected.workspaceId,
      selected.cwd,
    );
    await hydrateProviderModelCatalog(
      bridge,
      selected.provider,
      selected.workspaceId,
      selected.cwd,
    );
    if (selected.model && selected.model !== "default") {
      useProviderModelStore.getState().setSelectedModel(selected.provider, selected.model);
    }
  })();
}

export async function handleRenameStoredSession(
  bridge: SmokeBridge,
  sessionId: string,
  title: string,
): Promise<void> {
  const session = getSessionById(sessionId);
  const trimmedTitle = title.trim();
  if (!session || trimmedTitle.length === 0) return;

  try {
    const result = await bridge.renameStoredSession(session.id, trimmedTitle, session.workspaceId);
    useSessionStore.getState().setSessions((sessions) =>
      sessions.map((item) =>
        item.id === session.id
          ? {
              ...item,
              title: result.session.title ?? trimmedTitle,
            }
          : item,
      ),
    );
  } catch (error) {
    appendLog({
      provider: session.provider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to rename session.",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleDeleteStoredSession(
  bridge: SmokeBridge,
  sessionId: string,
): Promise<void> {
  const session = getSessionById(sessionId);
  if (!session) return;

  try {
    await bridge.deleteStoredSession(session.id, session.workspaceId);
    useSessionStore.getState().applySessionTransition({
      activeSessionId:
        useSessionStore.getState().activeSessionId === session.id
          ? undefined
          : useSessionStore.getState().activeSessionId,
      sessions: (sessions) => sessions.filter((item) => item.id !== session.id),
    });
    useChatStore
      .getState()
      .setChatMessages((messages) =>
        messages.filter((message) => message.sessionId !== session.id),
      );
    useSessionModeStore.getState().removeSessionMode(session.id);
  } catch (error) {
    appendLog({
      provider: session.provider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to delete session.",
      timestamp: new Date().toISOString(),
    });
  }
}

export function handleApprovalEvent(
  payload: Extract<SmokeBridgeEvent, { type: "approvalEvent" }>["payload"],
): void {
  if (payload.kind === "requested") {
    const approvalPresentation = formatToolPresentation({
      toolCallId: payload.toolCallId,
      toolKind: payload.toolKind,
      input: payload.rawInput,
      locations: payload.locations,
    });
    useApprovalStore.getState().upsertApproval(payload);
    if (payload.requestId) {
      const requestId = payload.requestId;
      useChatStore.getState().setChatMessages((chatMessages) =>
        upsertAssistantMessage(
          chatMessages,
          requestId,
          payload.sessionId,
          payload.provider,
          (message) => ({
            ...message,
            timestamp: payload.timestamp,
            blocks: upsertToolBlock(message.blocks ?? [], {
              toolCallId: payload.toolCallId,
              title: "",
              rawTitle: undefined,
              kind: payload.toolKind,
              state: "approval-requested",
              input: payload.rawInput,
              timestamp: payload.timestamp,
            }),
          }),
        ),
      );
    }
    appendLog({
      provider: payload.provider,
      level: "update",
      message: `Approval requested to ${toToolActionLabel(approvalPresentation.title)}.`,
      timestamp: payload.timestamp,
    });
    return;
  }

  const approvalStore = useApprovalStore.getState();
  const matchingApproval = approvalStore.pendingApprovals.find(
    (approval) => approval.approvalId === payload.approvalId,
  );
  const requestId = payload.requestId ?? matchingApproval?.requestId;
  const toolState: ChatToolCallState =
    payload.outcome.outcome === "cancelled" ? "output-denied" : "approval-responded";
  approvalStore.removeApproval(payload.approvalId);
  if (requestId) {
    useChatStore.getState().setChatMessages((chatMessages) =>
      upsertAssistantMessage(
        chatMessages,
        requestId,
        payload.sessionId,
        payload.provider,
        (message) => ({
          ...message,
          timestamp: payload.timestamp,
          blocks: upsertToolBlock(message.blocks ?? [], {
            toolCallId: payload.toolCallId,
            title: "",
            rawTitle: undefined,
            kind: matchingApproval?.toolKind,
            state: toolState,
            timestamp: payload.timestamp,
          }),
        }),
      ),
    );
  }
  appendLog({
    provider: payload.provider,
    level: "info",
    message:
      payload.outcome.outcome === "cancelled"
        ? `Approval ${payload.approvalId} cancelled.`
        : `Approval ${payload.approvalId} answered with ${payload.outcome.optionId}.`,
    timestamp: payload.timestamp,
  });
}

export function handleUserInputEvent(
  payload: Extract<SmokeBridgeEvent, { type: "userInputEvent" }>["payload"],
): void {
  if (payload.kind === "requested") {
    useUserInputStore.getState().upsertInput(payload);
    appendLog({
      provider: payload.provider,
      level: "update",
      message: "Agent requested user input before continuing.",
      timestamp: payload.timestamp,
    });
    return;
  }

  useUserInputStore.getState().removeInput(payload.inputId);
  appendLog({
    provider: payload.provider,
    level: "info",
    message:
      payload.outcome.outcome === "cancelled"
        ? `User input ${payload.inputId} cancelled.`
        : `User input ${payload.inputId} submitted.`,
    timestamp: payload.timestamp,
  });
}

export function handleAgentTranscriptEvent(
  payload: Extract<SmokeBridgeEvent, { type: "agentTranscriptEvent" }>["payload"],
): void {
  useLoggingStore.getState().appendTranscriptEntry(payload);
}

export function handleSessionModeConfigEvent(
  payload: Extract<SmokeBridgeEvent, { type: "sessionModeConfigEvent" }>["payload"],
): void {
  useSessionModeStore.getState().upsertModeConfig(payload.modeConfig);
  useSessionModeStore.getState().setPendingMode(payload.sessionId, undefined);
}

export function handlePlanReviewEvent(
  payload: Extract<SmokeBridgeEvent, { type: "planReviewEvent" }>["payload"],
): void {
  if (payload.kind === "requested") {
    usePlanReviewStore.getState().openReview(payload);
    return;
  }

  usePlanReviewStore.getState().closeReview(payload.reviewId);
  usePlanReviewStore.getState().setRespondingDecision(undefined);
}

export async function handleSetSessionMode(
  bridge: SmokeBridge,
  mode: NormalizedSessionMode,
  sessionId?: string,
): Promise<void> {
  const targetSession = getSessionById(sessionId ?? useSessionStore.getState().activeSessionId);
  if (!targetSession || !bridge.isAvailable()) {
    return;
  }

  useSessionModeStore.getState().setPendingMode(targetSession.id, mode);
  try {
    const result = await bridge.setSessionMode(
      targetSession.provider,
      mode,
      targetSession.id,
      targetSession.workspaceId,
      targetSession.cwd,
    );
    useSessionModeStore.getState().upsertModeConfig(result.modeConfig);
    appendLog({
      provider: result.provider,
      level: "info",
      message: `Switched ${result.sessionId.slice(0, 8)} to ${result.modeConfig.normalizedMode} mode.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    appendLog({
      provider: targetSession.provider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to switch session mode.",
      timestamp: new Date().toISOString(),
    });
    throw error;
  } finally {
    useSessionModeStore.getState().setPendingMode(targetSession.id, undefined);
  }
}

function maybeOpenCompletedPlanReview(
  payload: Extract<SmokeBridgeEvent, { type: "chatStreamEvent" }>["payload"],
): void {
  const sessionModeConfig =
    useSessionModeStore.getState().configsBySessionId[payload.sessionId] ??
    createDefaultProviderSessionModeConfig(payload.provider, payload.sessionId, payload.cwd);
  if (sessionModeConfig.normalizedMode !== "plan") {
    return;
  }
  if (usePlanReviewStore.getState().hasHandledRequest(payload.requestId)) {
    return;
  }

  const assistantMessage = useChatStore
    .getState()
    .chatMessages.find(
      (message) => message.requestId === payload.requestId && message.author === "assistant",
    );
  const extractedPlan = assistantMessage?.text
    ? extractPlanReviewContent(assistantMessage.text)
    : undefined;
  if (
    !extractedPlan ||
    extractedPlan.planText === "(No text returned.)" ||
    extractedPlan.planText === "(Cancelled before any text returned.)"
  ) {
    return;
  }

  usePlanReviewStore.getState().openReview({
    kind: "requested",
    reviewId: `plan-review-${payload.requestId}`,
    provider: payload.provider,
    sessionId: payload.sessionId,
    workspaceId: payload.workspaceId,
    cwd: payload.cwd,
    requestId: payload.requestId,
    source: extractedPlan.source,
    canResumeGeneration: false,
    planText: extractedPlan.planText,
    timestamp: payload.timestamp,
  });
}

async function flushQueuedPlanRevision(bridge: SmokeBridge, sessionId: string): Promise<void> {
  const queuedRevision = usePlanReviewStore.getState().consumeQueuedRevision(sessionId);
  if (!queuedRevision) {
    return;
  }
  await handleSendMessage(bridge, queuedRevision);
}

function optimisticallySetSessionMode(params: {
  provider: SmokeProvider;
  sessionId: string;
  workspaceId?: string;
  cwd: string;
  mode: NormalizedSessionMode;
}): void {
  const existingConfig = useSessionModeStore.getState().configsBySessionId[params.sessionId];
  useSessionModeStore.getState().upsertModeConfig({
    ...(existingConfig ??
      createDefaultProviderSessionModeConfig(params.provider, params.sessionId, params.cwd)),
    workspaceId: params.workspaceId,
    normalizedMode: params.mode,
  });
}

export async function handleRespondToPlanReview(
  bridge: SmokeBridge,
  decision: PlanReviewDecision,
): Promise<void> {
  const reviewStore = usePlanReviewStore.getState();
  const review = reviewStore.pendingReview;
  if (!review) {
    return;
  }

  reviewStore.setRespondingDecision(decision);
  try {
    if (decision === "start_build") {
      if (review.canResumeGeneration) {
        await bridge.respondToPlanReview(
          review.provider,
          review.reviewId,
          decision,
          review.sessionId,
          review.workspaceId,
          review.cwd,
        );
        optimisticallySetSessionMode({
          provider: review.provider,
          sessionId: review.sessionId,
          workspaceId: review.workspaceId,
          cwd: review.cwd,
          mode: "build",
        });
        void hydrateSessionModeConfig(
          bridge,
          review.provider,
          review.sessionId,
          review.workspaceId,
          review.cwd,
        );
        reviewStore.closeReview(review.reviewId);
        reviewStore.setRespondingDecision(undefined);
        return;
      } else {
        await handleSetSessionMode(bridge, "build", review.sessionId);
        reviewStore.closeReview(review.reviewId);
        reviewStore.setRespondingDecision(undefined);
        await handleSendMessage(bridge, "Proceed with implementation using the approved plan.");
        return;
      }
    }

    if (decision === "cancel") {
      if (review.canResumeGeneration) {
        await bridge.respondToPlanReview(
          review.provider,
          review.reviewId,
          decision,
          review.sessionId,
          review.workspaceId,
          review.cwd,
        );
      }
      reviewStore.closeReview(review.reviewId);
      reviewStore.setRespondingDecision(undefined);
      return;
    }

    const feedback = reviewStore.feedbackDraft.trim();
    if (feedback.length === 0) {
      reviewStore.setRespondingDecision(undefined);
      return;
    }

    if (review.canResumeGeneration) {
      reviewStore.queueRevision(review.sessionId, feedback);
      await bridge.respondToPlanReview(
        review.provider,
        review.reviewId,
        decision,
        review.sessionId,
        review.workspaceId,
        review.cwd,
      );
      reviewStore.closeReview(review.reviewId);
      reviewStore.setRespondingDecision(undefined);
      return;
    }

    reviewStore.closeReview(review.reviewId);
    reviewStore.setRespondingDecision(undefined);
    await handleSendMessage(bridge, feedback);
  } catch (error) {
    reviewStore.setRespondingDecision(undefined);
    appendLog({
      provider: review.provider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to resolve the plan review.",
      timestamp: new Date().toISOString(),
    });
  }
}

export function handleChatStreamEvent(
  bridge: SmokeBridge,
  payload: Extract<SmokeBridgeEvent, { type: "chatStreamEvent" }>["payload"],
): void {
  if (payload.kind === "session_ready") {
    useSessionStore.getState().applySessionTransition({
      activeSessionId: payload.sessionId,
      isDraftingSession: false,
      draftProvider: payload.provider,
      selectedProvider: payload.provider,
      sessions: (previousSessions) =>
        upsertSession(
          previousSessions,
          createSessionListItem(
            payload.provider,
            payload.sessionId,
            payload.cwd,
            payload.workspaceId,
            getSelectedModelValue(
              useProviderModelStore.getState().selected[payload.provider],
              useProviderModelStore.getState().catalogs[payload.provider],
            ),
            useGitStore.getState().statusByCwd[payload.cwd],
          ),
        ),
    });
    void hydrateGitStatus(bridge, payload.cwd, { force: true });
    void hydrateSessionModeConfig(bridge, payload.provider, payload.sessionId, payload.cwd);
    return;
  }

  if (payload.kind === "agent_chunk") {
    useChatStore.getState().setChatMessages((chatMessages) =>
      upsertAssistantMessage(
        chatMessages,
        payload.requestId,
        payload.sessionId,
        payload.provider,
        (message) => ({
          ...message,
          blocks: appendTextBlock(message.blocks ?? [], payload.text ?? "", payload.timestamp),
          status: "streaming",
          timestamp: payload.timestamp,
        }),
      ),
    );
    return;
  }

  if (payload.kind === "agent_thought_chunk") {
    useChatStore.getState().setChatMessages((chatMessages) =>
      upsertAssistantMessage(
        chatMessages,
        payload.requestId,
        payload.sessionId,
        payload.provider,
        (message) => ({
          ...message,
          blocks: appendReasoningBlock(message.blocks ?? [], payload.text ?? "", payload.timestamp),
          status: "streaming",
          timestamp: payload.timestamp,
        }),
      ),
    );
    return;
  }

  if (payload.kind === "session_info_update") {
    const nextTitle = typeof payload.title === "string" ? payload.title.trim() : "";
    if (nextTitle.length > 0) {
      useSessionStore
        .getState()
        .setSessions((sessions) =>
          sessions.map((session) =>
            session.id === payload.sessionId ? { ...session, title: nextTitle } : session,
          ),
        );
    }
    return;
  }

  if (payload.kind === "reasoning_update") {
    useChatStore.getState().setChatMessages((chatMessages) =>
      upsertAssistantMessage(
        chatMessages,
        payload.requestId,
        payload.sessionId,
        payload.provider,
        (message) => ({
          ...message,
          timestamp: payload.timestamp,
          blocks: appendReasoningStepBlock(message.blocks ?? [], {
            id: payload.eventId,
            summary: payload.summary,
            detail: payload.detail,
            updateType: payload.updateType,
            timestamp: payload.timestamp,
          }),
        }),
      ),
    );
    return;
  }

  if (payload.kind === "usage_update") {
    useContextStore.getState().setSessionUsage(payload.sessionId, {
      used: payload.used,
      size: payload.size,
      timestamp: payload.timestamp,
      modelId: payload.modelId,
      inputTokens: payload.inputTokens,
      outputTokens: payload.outputTokens,
      reasoningTokens: payload.reasoningTokens,
      cachedInputTokens: payload.cachedInputTokens,
    });
    return;
  }

  if (payload.kind === "tool_call" || payload.kind === "tool_call_update") {
    useChatStore.getState().setChatMessages((chatMessages) =>
      upsertAssistantMessage(
        chatMessages,
        payload.requestId,
        payload.sessionId,
        payload.provider,
        (message) => ({
          ...message,
          timestamp: payload.timestamp,
          blocks: upsertToolBlock(message.blocks ?? [], {
            toolCallId: payload.toolCallId,
            title: "",
            rawTitle: payload.toolTitle,
            kind: payload.toolKind,
            state: payload.toolState,
            input: payload.input,
            output: payload.output,
            errorText: payload.errorText,
            timestamp: payload.timestamp,
          }),
        }),
      ),
    );
    return;
  }

  if (payload.kind === "agent_complete") {
    useChatStore.getState().updateChat((prev) => ({
      isCancellingRequest: false,
      activeRequestId:
        prev.activeRequestId === payload.requestId ? undefined : prev.activeRequestId,
      chatMessages: prev.chatMessages.map((message) => {
        if (message.requestId !== payload.requestId || message.author !== "assistant") {
          return message;
        }
        return {
          ...message,
          status: "complete",
          timestamp: payload.timestamp,
          turnEndedAt: payload.timestamp,
          blocks: finalizeTrailingReasoningBlock(message.blocks ?? [], payload.timestamp),
          text: getCompletedAssistantText(message, payload.stopReason),
        };
      }),
    }));
    appendLog({
      provider: payload.provider,
      level: "info",
      message: `Request ${payload.requestId.slice(0, 8)} completed (${
        payload.stopReason ?? "unknown"
      }).`,
      timestamp: payload.timestamp,
    });
    void hydrateGitStatus(bridge, payload.cwd, { force: true });
    maybeOpenCompletedPlanReview(payload);
    void flushQueuedPlanRevision(bridge, payload.sessionId);
    return;
  }

  if (payload.kind !== "error") return;

  if (payload.fatal === false) {
    useChatStore.getState().setChatMessages((chatMessages) => [
      ...chatMessages,
      {
        id: crypto.randomUUID(),
        requestId: payload.requestId,
        sessionId: payload.sessionId,
        author: "system",
        provider: payload.provider,
        text: payload.text ?? "Provider diagnostic.",
        timestamp: payload.timestamp,
        status: "complete",
      },
    ]);
    appendLog({
      provider: payload.provider,
      level: "error",
      message: payload.text ?? "Provider diagnostic.",
      timestamp: payload.timestamp,
    });
    return;
  }

  useChatStore.getState().updateChat((prev) => {
    const existingIndex = prev.chatMessages.findIndex(
      (message) => message.requestId === payload.requestId && message.author === "assistant",
    );
    if (existingIndex < 0) {
      return {
        isCancellingRequest: false,
        activeRequestId:
          prev.activeRequestId === payload.requestId ? undefined : prev.activeRequestId,
        chatMessages: [
          ...prev.chatMessages,
          {
            id: crypto.randomUUID(),
            requestId: payload.requestId,
            sessionId: payload.sessionId,
            author: "system",
            provider: payload.provider,
            text: payload.text ?? "Request failed.",
            timestamp: payload.timestamp,
            status: "error",
          },
        ],
      };
    }

    const nextMessages = [...prev.chatMessages];
    const existing = nextMessages[existingIndex];
    nextMessages[existingIndex] = {
      ...existing,
      status: "error",
      text: payload.text ?? (existing.text || "Request failed."),
      timestamp: payload.timestamp,
      turnEndedAt: payload.timestamp,
    };
    return {
      isCancellingRequest: false,
      activeRequestId:
        prev.activeRequestId === payload.requestId ? undefined : prev.activeRequestId,
      chatMessages: nextMessages,
    };
  });
  appendLog({
    provider: payload.provider,
    level: "error",
    message: payload.text ?? "Request failed.",
    timestamp: payload.timestamp,
  });
  void hydrateGitStatus(bridge, payload.cwd, { force: true });
  void flushQueuedPlanRevision(bridge, payload.sessionId);
}

export function handleSmokeBridgeEvent(bridge: SmokeBridge, event: SmokeBridgeEvent): void {
  if (event.type === "chatStreamEvent") {
    handleChatStreamEvent(bridge, event.payload);
    return;
  }
  if (event.type === "appUpdateEvent") {
    useAppUpdateStore.getState().applyEvent(event.payload);
    return;
  }
  if (event.type === "approvalEvent") {
    handleApprovalEvent(event.payload);
    return;
  }
  if (event.type === "userInputEvent") {
    handleUserInputEvent(event.payload);
    return;
  }
  if (event.type === "agentTranscriptEvent") {
    handleAgentTranscriptEvent(event.payload);
    return;
  }
  if (event.type === "availableCommandsEvent") {
    const { sessionId, commands } = event.payload;
    useRightSidebarStore.getState().setAvailableCommands(sessionId, commands);
    return;
  }
  if (event.type === "sessionModeConfigEvent") {
    handleSessionModeConfigEvent(event.payload);
    return;
  }
  if (event.type === "planReviewEvent") {
    handlePlanReviewEvent(event.payload);
    return;
  }
  if (event.type === "smokeEvent") {
    appendLog({
      provider: event.payload.provider,
      level: event.payload.level,
      message: event.payload.message,
      timestamp: event.payload.timestamp,
    });
    return;
  }
  appendLog({
    provider: event.payload.provider,
    level: event.payload.success ? "info" : "error",
    message: event.payload.success
      ? `Run ${event.payload.runId} finished successfully.`
      : `Run ${event.payload.runId} failed: ${event.payload.error ?? "Unknown error."}`,
    timestamp: event.payload.timestamp,
  });
}

export async function handleStopActiveRequest(bridge: SmokeBridge): Promise<void> {
  if (
    !useChatStore.getState().activeRequestId ||
    !useSessionStore.getState().activeSessionId ||
    useChatStore.getState().isCancellingRequest
  ) {
    return;
  }
  const provider = getActiveProvider();
  const activeSession = getSessionById(useSessionStore.getState().activeSessionId);
  useChatStore.getState().setIsCancellingRequest(true);
  try {
    const result = await bridge.cancelChatMessage(
      provider,
      useSessionStore.getState().activeSessionId,
      useChatStore.getState().activeRequestId,
      activeSession?.workspaceId,
      getSessionCwd(useSessionStore.getState().activeSessionId),
    );
    appendLog({
      provider: result.provider,
      level: "info",
      message: `Cancellation requested for ${result.requestId.slice(0, 8)}.`,
      timestamp: result.cancelledAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel request.";
    useChatStore.getState().setIsCancellingRequest(false);
    appendLog({
      provider,
      level: "error",
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleRespondToApproval(
  bridge: SmokeBridge,
  approvalId: string,
  outcome: ApprovalOutcome,
): Promise<boolean> {
  const approvalStore = useApprovalStore.getState();
  const approval = approvalStore.pendingApprovals.find((entry) => entry.approvalId === approvalId);
  const provider = approval?.provider ?? getActiveProvider();
  approvalStore.setRespondingApprovalId(approvalId);
  try {
    await bridge.respondToApproval(
      provider,
      approvalId,
      outcome,
      approval?.workspaceId,
      approval?.cwd ?? getSessionCwd(approval?.sessionId),
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to answer approval request.";
    useApprovalStore.getState().setRespondingApprovalId(undefined);
    appendLog({
      provider,
      level: "error",
      message,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
}

export async function handleRespondToUserInput(
  bridge: SmokeBridge,
  inputId: string,
  outcome: UserInputOutcome,
): Promise<void> {
  const inputStore = useUserInputStore.getState();
  const input = inputStore.pendingInputs.find((entry) => entry.inputId === inputId);
  const provider = input?.provider ?? getActiveProvider();
  inputStore.setRespondingInputId(inputId);
  try {
    await bridge.respondToUserInput(
      provider,
      inputId,
      outcome,
      input?.workspaceId,
      input?.cwd ?? getSessionCwd(input?.sessionId),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to answer user input request.";
    useUserInputStore.getState().setRespondingInputId(undefined);
    appendLog({
      provider,
      level: "error",
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleSendMessage(
  bridge: SmokeBridge,
  messageOverride?: string,
): Promise<void> {
  if (useChatStore.getState().activeRequestId || useChatStore.getState().isSending) return;
  const messageText = (messageOverride ?? useChatStore.getState().chatInput).trim();
  if (messageText.length === 0) return;
  const activeSessionId = useSessionStore.getState().activeSessionId;
  if (!activeSessionId) return;
  const activeSession = getSessionById(activeSessionId);
  const selectedProvider = activeSession?.provider ?? useSessionStore.getState().selectedProvider;
  const providerModelState = useProviderModelStore.getState();
  const selectedCatalog = providerModelState.catalogs[selectedProvider];
  const selectedModelValue =
    getSelectedModelValue(providerModelState.selected[selectedProvider], selectedCatalog) ||
    normalizeStoredModel(activeSession?.model) ||
    "";
  const selectedModel = selectedModelValue.trim() || undefined;
  const shouldClearInput = messageOverride === undefined;
  const targetSessionId = activeSession?.id ?? activeSessionId;
  const userMessageId = crypto.randomUUID();
  const optimisticRequestId = crypto.randomUUID();
  const optimisticAssistantMessage = createAssistantMessage(
    optimisticRequestId,
    targetSessionId,
    selectedProvider,
    selectedModelValue || undefined,
  );

  if (!bridge.isAvailable()) {
    const timestamp = new Date().toISOString();
    useChatStore.getState().setChatMessages((chatMessages) => [
      ...chatMessages,
      {
        id: crypto.randomUUID(),
        author: "system",
        provider: selectedProvider,
        text: "Electrobun bridge is unavailable. Launch the app with the Electrobun runtime.",
        timestamp,
        status: "error",
      },
    ]);
    return;
  }

  const timestamp = new Date().toISOString();
  const optimisticAssistantStartedAt = timestamp;
  useChatStore.getState().updateChat((prev) => ({
    chatInput: shouldClearInput ? "" : prev.chatInput,
    chatMessages: [
      ...prev.chatMessages,
      {
        id: userMessageId,
        sessionId: targetSessionId,
        author: "user",
        provider: selectedProvider,
        model: selectedModelValue || undefined,
        text: messageText,
        timestamp,
        status: "complete",
      },
      {
        ...optimisticAssistantMessage,
        timestamp: optimisticAssistantStartedAt,
        turnStartedAt: optimisticAssistantStartedAt,
      },
    ],
    isSending: true,
  }));

  try {
    const result = await bridge.sendChatMessage(
      selectedProvider,
      messageText,
      selectedModel,
      targetSessionId,
      activeSession?.workspaceId,
      activeSession?.cwd,
    );
    useChatStore.getState().updateChat((prev) => {
      const hasStreamingMessage = prev.chatMessages.some(
        (message) =>
          message.requestId === result.requestId &&
          message.author === "assistant" &&
          message.id !== optimisticAssistantMessage.id,
      );
      const mappedMessages = prev.chatMessages
        .filter((message) => !(hasStreamingMessage && message.id === optimisticAssistantMessage.id))
        .map((message) =>
          message.id === userMessageId
            ? { ...message, requestId: result.requestId, sessionId: result.sessionId }
            : message.id === optimisticAssistantMessage.id
              ? {
                  ...message,
                  requestId: result.requestId,
                  sessionId: result.sessionId,
                  provider: result.provider,
                  model: result.model,
                }
              : message,
        );
      return {
        activeRequestId: result.requestId,
        isSending: false,
        chatMessages: mappedMessages,
      };
    });
    useSessionStore.getState().applySessionTransition({
      activeSessionId: result.sessionId,
      isDraftingSession: false,
      draftProvider: result.provider,
      selectedProvider: result.provider,
      sessions: (previousSessions) =>
        upsertSession(
          previousSessions,
          createSessionListItem(
            result.provider,
            result.sessionId,
            result.cwd,
            result.workspaceId ?? activeSession?.workspaceId,
            result.model ??
              getSelectedModelValue(
                useProviderModelStore.getState().selected[result.provider],
                useProviderModelStore.getState().catalogs[result.provider],
              ),
            useGitStore.getState().statusByCwd[result.cwd],
          ),
        ),
    });
    void hydrateGitStatus(bridge, result.cwd, { force: true });
    void hydrateProviderModelCatalog(bridge, result.provider, result.workspaceId, result.cwd);
    appendLog({
      provider: result.provider,
      level: "info",
      message: `Request ${result.requestId.slice(0, 8)} queued for ${result.provider}.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorText =
      error instanceof Error ? error.message : "Failed to send message to provider.";
    useChatStore.getState().updateChat((prev) => ({
      isSending: false,
      isCancellingRequest: false,
      chatMessages: [
        ...prev.chatMessages.filter((message) => message.id !== optimisticAssistantMessage.id),
        {
          id: crypto.randomUUID(),
          author: "system",
          provider: selectedProvider,
          text: errorText,
          timestamp: new Date().toISOString(),
          status: "error",
        },
      ],
    }));
  }
}

export async function handleRetryLastMessage(bridge: SmokeBridge): Promise<void> {
  if (
    useChatStore.getState().isSending ||
    useChatStore.getState().activeRequestId ||
    useSessionCreationStore.getState().isCreatingSession
  ) {
    return;
  }
  const lastUserMessage = getLastUserMessage(useSessionStore.getState().activeSessionId);
  if (!lastUserMessage) return;
  await handleSendMessage(bridge, lastUserMessage.text);
}
