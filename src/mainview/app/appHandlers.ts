import type {
  ApprovalOutcome,
  GetGitStatusResult,
  GitStatusSummary,
  SmokeProvider,
} from "../../shared/AppRPC.ts";
import type { ChatMessage, ChatReasoningStep, ChatToolCall } from "../chat/types.ts";
import type { ChatToolCallState } from "../../shared/AppRPC.ts";
import { formatToolPresentation, toToolActionLabel } from "../chat/toolPresentation.ts";
import type { SmokeBridge, SmokeBridgeEvent } from "../bridge/SmokeBridge.ts";
import { useApprovalStore } from "../state/approvalStore.ts";
import { useChatStore } from "../state/chatStore.ts";
import { useDirectoryStore } from "../state/directoryStore.ts";
import { useGitStore } from "../state/gitStore.ts";
import { useLoggingStore, type SmokeLogLine } from "../state/loggingStore.ts";
import { useProviderModelStore } from "../state/providerModelStore.ts";
import { useRightSidebarStore } from "../state/rightSidebarStore.ts";
import { useSessionCreationStore } from "../state/sessionCreationStore.ts";
import { useSessionStore, type ChatSession } from "../state/sessionStore.ts";
import { getSelectedModelValue } from "../providerModelCatalogState.ts";
import { getSmokeProviderLabel } from "../../shared/providerModels.ts";

export function getGitBranchLabel(status: GetGitStatusResult): string | undefined {
  return (
    status.branch?.trim() ||
    (status.isGitRepository ? `detached @ ${status.head ?? "HEAD"}` : undefined)
  );
}

export function formatGitSessionSummary(status: GetGitStatusResult): string | undefined {
  if (!status.isGitRepository) {
    return undefined;
  }
  return status.files.length === 0 ? "clean" : `${status.files.length} changed`;
}

export function formatGitChangeBreakdown(summary: GitStatusSummary): string {
  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${summary.added} added`);
  if (summary.modified > 0) parts.push(`${summary.modified} modified`);
  if (summary.deleted > 0) parts.push(`${summary.deleted} deleted`);
  if (summary.renamed > 0) parts.push(`${summary.renamed} renamed`);
  if (summary.untracked > 0) parts.push(`${summary.untracked} untracked`);
  if (summary.conflicted > 0) parts.push(`${summary.conflicted} conflicted`);
  return parts.join(" · ");
}

function createAssistantMessage(
  requestId: string,
  sessionId: string,
  provider: SmokeProvider,
  model?: string,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    requestId,
    sessionId,
    author: "assistant",
    provider,
    model,
    text: "",
    timestamp: new Date().toISOString(),
    status: "streaming",
    reasoningSteps: [],
    tools: [],
  };
}

export function upsertToolCall(
  toolCalls: readonly ChatToolCall[],
  nextTool: ChatToolCall,
): ChatToolCall[] {
  const existingIndex = toolCalls.findIndex((tool) => tool.toolCallId === nextTool.toolCallId);
  const mergeToolCall = (current?: ChatToolCall): ChatToolCall => {
    const merged: ChatToolCall = {
      ...current,
      ...nextTool,
      rawTitle: nextTool.rawTitle ?? current?.rawTitle,
      kind: nextTool.kind ?? current?.kind,
      input: nextTool.input ?? current?.input,
      output: nextTool.output ?? current?.output,
      errorText: nextTool.errorText ?? current?.errorText,
    };
    const presentation = formatToolPresentation({
      toolCallId: merged.toolCallId,
      toolTitle: merged.rawTitle,
      toolKind: merged.kind,
      input: merged.input,
      output: merged.output,
      errorText: merged.errorText,
    });
    return { ...merged, title: presentation.title, subtitle: presentation.subtitle };
  };
  if (existingIndex < 0) {
    return [...toolCalls, mergeToolCall()];
  }
  const merged = [...toolCalls];
  merged[existingIndex] = mergeToolCall(merged[existingIndex]);
  return merged;
}

export function appendReasoningStep(
  reasoningSteps: readonly ChatReasoningStep[],
  step: ChatReasoningStep,
): ChatReasoningStep[] {
  const existingIndex = reasoningSteps.findIndex((entry) => entry.id === step.id);
  if (existingIndex < 0) {
    return [...reasoningSteps, step];
  }
  const nextSteps = [...reasoningSteps];
  nextSteps[existingIndex] = step;
  return nextSteps;
}

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
  next[existingIndex] = { ...next[existingIndex], ...session };
  return next;
}

export function createSessionListItem(
  provider: SmokeProvider,
  sessionId: string,
  cwd: string,
  model?: string,
  gitStatus?: GetGitStatusResult,
): ChatSession {
  return {
    id: sessionId,
    provider,
    title: `${getSmokeProviderLabel(provider)} ${sessionId.slice(0, 8)}`,
    model: model?.trim() || "default",
    contextWindow: "live session",
    cwd,
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
  useLoggingStore.getState().reset();
  useGitStore.getState().reset();
  useDirectoryStore.getState().reset();
  useProviderModelStore.getState().reset();
  useSessionStore.getState().reset();
  useSessionCreationStore.getState().reset(homeDirectory ?? "");
  useRightSidebarStore.getState().reset();
}

export function reconcileGitTabForActiveSession(gitAutoOpenedSessions: Set<string>): boolean {
  const activeSessionId = useSessionStore.getState().activeSessionId;
  const activeCwd = getSessionById(activeSessionId)?.cwd;
  if (!activeSessionId || !activeCwd || gitAutoOpenedSessions.has(activeSessionId)) {
    return false;
  }

  const gitStatus = useGitStore.getState().statusByCwd[activeCwd];
  if (!gitStatus?.isGitRepository) {
    return false;
  }

  gitAutoOpenedSessions.add(activeSessionId);
  if (!useRightSidebarStore.getState().openTabs.includes("git")) {
    useRightSidebarStore.getState().openTab("git");
  }
  return true;
}

export function reconcileActiveSessionSidebarState(params: {
  bridge: SmokeBridge;
  previousActiveSessionId?: string;
  previousActiveCwd?: string;
  filesAutoOpenedSessions: Set<string>;
  gitAutoOpenedSessions: Set<string>;
}): void {
  const { bridge, previousActiveSessionId, previousActiveCwd, filesAutoOpenedSessions } = params;
  const nextActiveSessionId = useSessionStore.getState().activeSessionId;
  const activeCwd = getSessionById(nextActiveSessionId)?.cwd ?? "";
  const sidebarState = useRightSidebarStore.getState();

  if (previousActiveCwd !== undefined && activeCwd.length > 0 && activeCwd !== previousActiveCwd) {
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
    previousActiveSessionId !== undefined &&
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
  } catch (error) {
    appendLog({
      provider: useSessionStore.getState().selectedProvider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to load the home directory.",
      timestamp: new Date().toISOString(),
    });
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

export async function hydrateGitStatus(
  bridge: SmokeBridge,
  cwd?: string,
  options?: { force?: boolean },
): Promise<void> {
  const trimmedCwd = cwd?.trim();
  if (!trimmedCwd || !bridge.isAvailable()) return;
  const gitState = useGitStore.getState();
  if (gitState.loadingByCwd[trimmedCwd]) return;
  if (!options?.force && gitState.statusByCwd[trimmedCwd]) return;
  gitState.beginLoad(trimmedCwd);
  try {
    const result = await bridge.getGitStatus(trimmedCwd);
    useGitStore.getState().completeLoad(trimmedCwd, result);
    useSessionStore.getState().setSessions((previousSessions) =>
      previousSessions.map((session) =>
        session.cwd === trimmedCwd
          ? {
              ...session,
              gitBranch: getGitBranchLabel(result),
              gitStatusSummary: formatGitSessionSummary(result),
            }
          : session,
      ),
    );
  } catch (error) {
    useGitStore
      .getState()
      .failLoad(trimmedCwd, error instanceof Error ? error.message : "Failed to load git status.");
  }
}

export async function hydrateProviderModelCatalog(
  bridge: SmokeBridge,
  provider: SmokeProvider,
  cwd?: string,
): Promise<void> {
  if (!bridge.isAvailable()) return;
  try {
    const result = await bridge.getProviderModelCatalog(provider, cwd);
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

export async function hydrateAvailableCommands(bridge: SmokeBridge): Promise<void> {
  const activeSession = getSessionById(useSessionStore.getState().activeSessionId);
  if (!activeSession) return;
  if (!bridge.isAvailable()) return;
  try {
    const result = await bridge.getAvailableCommands(
      activeSession.provider,
      activeSession.id,
      activeSession.cwd,
    );
    if (!result.sessionId) return;
    useRightSidebarStore.getState().setAvailableCommandsIfAbsent(result.sessionId, result.commands);
  } catch {
    // ignore — no cached commands yet
  }
}

export function handleOpenNewSessionDialog(): void {
  const creationStore = useSessionCreationStore.getState();
  if (
    useChatStore.getState().activeRequestId ||
    useChatStore.getState().isSending ||
    creationStore.isCreatingSession
  ) {
    return;
  }
  const activeSession = getSessionById(useSessionStore.getState().activeSessionId);
  const nextProvider = activeSession?.provider ?? useSessionStore.getState().selectedProvider;
  const nextCwd = (() => {
    if (activeSession?.cwd) return activeSession.cwd;
    if (creationStore.newSessionCwd.trim().length > 0) return creationStore.newSessionCwd;
    return useDirectoryStore.getState().homeDirectory ?? "";
  })();
  creationStore.openDialog(nextProvider, nextCwd);
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
  const cwd = creationStore.newSessionCwd.trim();
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
    const created = await bridge.createChatSession(provider, cwd);
    useSessionCreationStore.setState({
      isCreatingSession: false,
      isNewSessionDialogOpen: false,
      newSessionProvider: created.provider,
      newSessionCwd: created.cwd,
    });
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
            getSelectedModelValue(
              useProviderModelStore.getState().selected[created.provider],
              useProviderModelStore.getState().catalogs[created.provider],
            ),
            useGitStore.getState().statusByCwd[created.cwd],
          ),
        ),
    });
    void hydrateGitStatus(bridge, created.cwd, { force: true });
    void hydrateProviderModelCatalog(bridge, created.provider, created.cwd);
    appendLog({
      provider: created.provider,
      level: "info",
      message: `Created session ${created.sessionId.slice(0, 8)} in ${created.cwd}.`,
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
  void hydrateGitStatus(bridge, selected.cwd, { force: true });
  void hydrateProviderModelCatalog(bridge, selected.provider, selected.cwd);
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
            tools: upsertToolCall(message.tools ?? [], {
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
          tools: upsertToolCall(message.tools ?? [], {
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

export function handleAgentTranscriptEvent(
  payload: Extract<SmokeBridgeEvent, { type: "agentTranscriptEvent" }>["payload"],
): void {
  useLoggingStore.getState().appendTranscriptEntry(payload);
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
            getSelectedModelValue(
              useProviderModelStore.getState().selected[payload.provider],
              useProviderModelStore.getState().catalogs[payload.provider],
            ),
            useGitStore.getState().statusByCwd[payload.cwd],
          ),
        ),
    });
    void hydrateGitStatus(bridge, payload.cwd, { force: true });
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
          text: `${message.text}${payload.text ?? ""}`,
          status: "streaming",
          timestamp: payload.timestamp,
        }),
      ),
    );
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
          reasoningSteps: appendReasoningStep(message.reasoningSteps ?? [], {
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
    useLoggingStore.getState().setSessionUsage(payload.sessionId, {
      used: payload.used,
      size: payload.size,
      timestamp: payload.timestamp,
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
          tools: upsertToolCall(message.tools ?? [], {
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
          text:
            message.text.length === 0
              ? payload.stopReason === "cancelled"
                ? "(Cancelled before any text returned.)"
                : "(No text returned.)"
              : message.text,
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
    return;
  }

  if (payload.kind !== "error") return;

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
}

export function handleSmokeBridgeEvent(bridge: SmokeBridge, event: SmokeBridgeEvent): void {
  if (event.type === "chatStreamEvent") {
    handleChatStreamEvent(bridge, event.payload);
    return;
  }
  if (event.type === "approvalEvent") {
    handleApprovalEvent(event.payload);
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
  useChatStore.getState().setIsCancellingRequest(true);
  try {
    const result = await bridge.cancelChatMessage(
      provider,
      useSessionStore.getState().activeSessionId,
      useChatStore.getState().activeRequestId,
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
): Promise<void> {
  const approvalStore = useApprovalStore.getState();
  const approval = approvalStore.pendingApprovals.find((entry) => entry.approvalId === approvalId);
  const provider = approval?.provider ?? getActiveProvider();
  approvalStore.setRespondingApprovalId(approvalId);
  try {
    await bridge.respondToApproval(
      provider,
      approvalId,
      outcome,
      approval?.cwd ?? getSessionCwd(approval?.sessionId),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to answer approval request.";
    useApprovalStore.getState().setRespondingApprovalId(undefined);
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
  if (!useSessionStore.getState().activeSessionId) return;
  const activeSession = getSessionById(useSessionStore.getState().activeSessionId);
  const selectedProvider = activeSession?.provider ?? useSessionStore.getState().selectedProvider;
  const providerModelState = useProviderModelStore.getState();
  const selectedCatalog = providerModelState.catalogs[selectedProvider];
  const selectedModelValue = getSelectedModelValue(
    providerModelState.selected[selectedProvider],
    selectedCatalog,
  );
  const selectedModel = selectedModelValue.trim() || undefined;
  const shouldClearInput = messageOverride === undefined;
  const targetSessionId = activeSession?.id;
  const userMessageId = crypto.randomUUID();

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
    ],
    isSending: true,
  }));

  try {
    const result = await bridge.sendChatMessage(
      selectedProvider,
      messageText,
      selectedModel,
      targetSessionId,
      activeSession?.cwd,
    );
    useChatStore.getState().updateChat((prev) => {
      const hasStreamingMessage = prev.chatMessages.some(
        (message) => message.requestId === result.requestId && message.author === "assistant",
      );
      return {
        activeRequestId: result.requestId,
        isSending: false,
        chatMessages: hasStreamingMessage
          ? prev.chatMessages.map((message) =>
              message.id === userMessageId
                ? { ...message, requestId: result.requestId, sessionId: result.sessionId }
                : message,
            )
          : [
              ...prev.chatMessages.map((message) =>
                message.id === userMessageId
                  ? { ...message, requestId: result.requestId, sessionId: result.sessionId }
                  : message,
              ),
              {
                id: crypto.randomUUID(),
                requestId: result.requestId,
                sessionId: result.sessionId,
                author: "assistant",
                provider: result.provider,
                model: result.model,
                text: "",
                timestamp: new Date().toISOString(),
                status: "streaming",
                reasoningSteps: [],
                tools: [],
              },
            ],
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
    void hydrateProviderModelCatalog(bridge, result.provider, result.cwd);
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
        ...prev.chatMessages,
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
