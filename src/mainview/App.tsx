import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { InspectorPanel } from "../ui/components/InspectorPanel.tsx";
import { SessionListPanel, type SessionListItem } from "../ui/components/SessionListPanel.tsx";
import { PrimaryButton } from "../ui/components/ui/PrimaryButton.tsx";
import type { SmokeProvider } from "../shared/AppRPC.ts";
import { getSmokeProviderLabel } from "../shared/providerModels.ts";
import type { ChatMessage } from "./chat/types.ts";
import { ChatSurface } from "./components/ChatSurface.tsx";
import { ResizableMainLayout } from "./components/ResizableMainLayout.tsx";
import { ChatComposer } from "./components/ChatComposer.tsx";
import { FilesPanel } from "./components/FilesPanel.tsx";
import { GitPanel } from "./components/GitPanel.tsx";
import { RightSidebarTabs, type RightSidebarTabType } from "./components/RightSidebarTabs.tsx";
import { NoopSmokeBridge, type SmokeBridge, type SmokeBridgeEvent } from "./bridge/SmokeBridge.ts";
import { NewSessionDialog } from "./components/NewSessionDialog.tsx";
import {
  getProviderModelHelperText,
  getProviderModelSelection,
  getProviderModelOptions,
  getSelectedModelValue,
  resolveProviderModelSelection,
} from "./providerModelCatalogState.ts";
import { type ThemePreference } from "./theme/themePreference.ts";
import { useThemeStore } from "./theme/themeStore.ts";
import { ApprovalDialog } from "./components/ApprovalDialog.tsx";
import { formatToolPresentation, toToolActionLabel } from "./chat/toolPresentation.ts";
import { useUIStore } from "./state/uiStore.ts";
import { useDirectoryStore } from "./state/directoryStore.ts";
import { useGitStore } from "./state/gitStore.ts";
import { useProviderModelStore } from "./state/providerModelStore.ts";
import { useLoggingStore, type SmokeLogLine } from "./state/loggingStore.ts";
import { useApprovalStore } from "./state/approvalStore.ts";
import { useChatStore } from "./state/chatStore.ts";
import { useSessionCreationStore } from "./state/sessionCreationStore.ts";
import { useSessionStore, type ChatSession } from "./state/sessionStore.ts";
import type {
  ApprovalOutcome,
  AvailableCommand,
  ChatToolCallState,
  GetGitStatusResult,
  GitStatusSummary,
} from "../shared/AppRPC.ts";
import type { ChatReasoningStep, ChatToolCall } from "./chat/types.ts";
import type {
  AppTestAction,
  AppTestApprovalSnapshot,
  AppTestMessageSnapshot,
  AppTestSessionSnapshot,
  AppTestSnapshot,
  AppTestWaitForStateParams,
} from "../shared/e2e.ts";
import { registerAppTestDriver, unregisterAppTestDriver } from "./testing/appTestDriver.ts";

interface AppProps {
  smokeBridge?: SmokeBridge;
}

interface AppState {
  openRightSidebarTabs: RightSidebarTabType[];
  activeRightSidebarTab: RightSidebarTabType;
  availableCommandsBySession: Record<string, AvailableCommand[]>;
  isRightSidebarOpen: boolean;
}

const DEFAULT_MODEL_VALUE = "__default_model__";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function getGitBranchLabel(status: GetGitStatusResult): string | undefined {
  return (
    status.branch?.trim() ||
    (status.isGitRepository ? `detached @ ${status.head ?? "HEAD"}` : undefined)
  );
}

function formatGitSessionSummary(status: GetGitStatusResult): string | undefined {
  if (!status.isGitRepository) {
    return undefined;
  }
  return status.files.length === 0 ? "clean" : `${status.files.length} changed`;
}

function formatGitChangeBreakdown(summary: GitStatusSummary): string {
  const parts: string[] = [];
  if (summary.added > 0) {
    parts.push(`${summary.added} added`);
  }
  if (summary.modified > 0) {
    parts.push(`${summary.modified} modified`);
  }
  if (summary.deleted > 0) {
    parts.push(`${summary.deleted} deleted`);
  }
  if (summary.renamed > 0) {
    parts.push(`${summary.renamed} renamed`);
  }
  if (summary.untracked > 0) {
    parts.push(`${summary.untracked} untracked`);
  }
  if (summary.conflicted > 0) {
    parts.push(`${summary.conflicted} conflicted`);
  }
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

function upsertToolCall(
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
    return {
      ...merged,
      title: presentation.title,
      subtitle: presentation.subtitle,
    };
  };
  if (existingIndex < 0) {
    return [...toolCalls, mergeToolCall()];
  }
  const merged = [...toolCalls];
  merged[existingIndex] = mergeToolCall(merged[existingIndex]);
  return merged;
}

function appendReasoningStep(
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

function upsertAssistantMessage(
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

function matchesTestWaitState(
  snapshot: AppTestSnapshot,
  params: AppTestWaitForStateParams,
): boolean {
  if (params.activeSessionId !== undefined && snapshot.activeSessionId !== params.activeSessionId) {
    return false;
  }
  if (
    params.hasActiveRequest !== undefined &&
    Boolean(snapshot.activeRequestId) !== params.hasActiveRequest
  ) {
    return false;
  }
  if (params.sessionCount !== undefined && snapshot.sessions.length !== params.sessionCount) {
    return false;
  }
  if (
    params.visibleMessageCount !== undefined &&
    snapshot.visibleMessages.length !== params.visibleMessageCount
  ) {
    return false;
  }
  if (
    params.pendingApprovalCount !== undefined &&
    snapshot.pendingApprovals.length !== params.pendingApprovalCount
  ) {
    return false;
  }

  const lastMessage = snapshot.visibleMessages[snapshot.visibleMessages.length - 1];
  if (params.lastMessageAuthor !== undefined && lastMessage?.author !== params.lastMessageAuthor) {
    return false;
  }
  if (params.lastMessageStatus !== undefined && lastMessage?.status !== params.lastMessageStatus) {
    return false;
  }

  return true;
}

export class App extends React.Component<AppProps, AppState> {
  private readonly smokeBridge: SmokeBridge;
  private unsubscribeBridge?: () => void;
  private unsubscribeUIStore?: () => void;
  private unsubscribeThemeStore?: () => void;
  private unsubscribeDirectoryStore?: () => void;
  private unsubscribeGitStore?: () => void;
  private unsubscribeProviderModelStore?: () => void;
  private unsubscribeLoggingStore?: () => void;
  private unsubscribeApprovalStore?: () => void;
  private unsubscribeChatStore?: () => void;
  private unsubscribeSessionCreationStore?: () => void;
  private unsubscribeSessionStore?: () => void;
  private gitPreviewHydrationTimeout?: number;
  private readonly filesAutoOpenedForSessions = new Set<string>();
  private readonly gitAutoOpenedForSessions = new Set<string>();

  constructor(props: AppProps) {
    super(props);
    this.smokeBridge = props.smokeBridge ?? new NoopSmokeBridge();
    this.state = this.createInitialState();
  }

  private createInitialState(overrides: Partial<AppState> = {}): AppState {
    return {
      openRightSidebarTabs: ["inspector"],
      activeRightSidebarTab: "inspector",
      availableCommandsBySession: {},
      isRightSidebarOpen: useUIStore.getState().isRightSidebarOpen,
      ...overrides,
    };
  }

  componentDidMount(): void {
    registerAppTestDriver(this);
    window.addEventListener("mouseup", this.handleWindowDragEnd);
    this.unsubscribeBridge = this.smokeBridge.subscribe((event) => {
      this.handleSmokeBridgeEvent(event);
    });
    this.unsubscribeThemeStore = useThemeStore.subscribe(() => {
      this.forceUpdate();
    });
    this.unsubscribeDirectoryStore = useDirectoryStore.subscribe(() => {
      this.forceUpdate();
    });
    this.unsubscribeGitStore = useGitStore.subscribe(() => {
      this.forceUpdate();
    });
    this.unsubscribeProviderModelStore = useProviderModelStore.subscribe(() => {
      this.forceUpdate();
    });
    this.unsubscribeLoggingStore = useLoggingStore.subscribe(() => {
      this.forceUpdate();
    });
    this.unsubscribeApprovalStore = useApprovalStore.subscribe(() => {
      this.forceUpdate();
    });
    this.unsubscribeChatStore = useChatStore.subscribe(() => {
      this.forceUpdate();
    });
    this.unsubscribeSessionCreationStore = useSessionCreationStore.subscribe((next, prev) => {
      this.forceUpdate();
      if (next.isNewSessionDialogOpen) {
        const dialogJustOpened = !prev.isNewSessionDialogOpen;
        const cwdChanged = prev.newSessionCwd !== next.newSessionCwd;
        if (dialogJustOpened || cwdChanged) {
          this.scheduleNewSessionGitStatusHydration();
        }
      } else if (prev.isNewSessionDialogOpen) {
        this.clearNewSessionGitStatusHydration();
      }
    });
    this.unsubscribeSessionStore = useSessionStore.subscribe((next, prev) => {
      this.forceUpdate();
      const previousActiveCwd =
        prev.sessions.find((session) => session.id === prev.activeSessionId)?.cwd ?? "";
      const nextActiveSession = next.sessions.find(
        (session) => session.id === next.activeSessionId,
      );
      const activeCwd = nextActiveSession?.cwd ?? "";
      const nextActiveSessionId = next.activeSessionId;

      if (activeCwd.length > 0 && activeCwd !== previousActiveCwd) {
        if (this.state.openRightSidebarTabs.includes("files")) {
          void this.hydrateSessionDirectory(activeCwd);
        }
        void this.hydrateGitStatus(activeCwd, { force: true });
      }

      if (
        nextActiveSessionId &&
        activeCwd.length > 0 &&
        !this.filesAutoOpenedForSessions.has(nextActiveSessionId)
      ) {
        this.filesAutoOpenedForSessions.add(nextActiveSessionId);
        if (!this.state.openRightSidebarTabs.includes("files")) {
          this.setState((previousState) => ({
            openRightSidebarTabs: previousState.openRightSidebarTabs.includes("files")
              ? previousState.openRightSidebarTabs
              : [...previousState.openRightSidebarTabs, "files"],
          }));
          void this.hydrateSessionDirectory(activeCwd);
        }
      }

      if (
        nextActiveSessionId &&
        activeCwd.length > 0 &&
        !this.gitAutoOpenedForSessions.has(nextActiveSessionId)
      ) {
        const gitStatus = useGitStore.getState().statusByCwd[activeCwd];
        if (gitStatus?.isGitRepository) {
          this.gitAutoOpenedForSessions.add(nextActiveSessionId);
          if (!this.state.openRightSidebarTabs.includes("git")) {
            this.setState((previousState) => ({
              openRightSidebarTabs: previousState.openRightSidebarTabs.includes("git")
                ? previousState.openRightSidebarTabs
                : [...previousState.openRightSidebarTabs, "git"],
            }));
          }
        }
      }

      if (
        nextActiveSessionId &&
        nextActiveSessionId !== prev.activeSessionId &&
        this.state.availableCommandsBySession[nextActiveSessionId] === undefined
      ) {
        void this.hydrateAvailableCommands();
      }
    });
    this.unsubscribeUIStore = useUIStore.subscribe((state) => {
      if (state.isRightSidebarOpen === this.state.isRightSidebarOpen) {
        return;
      }
      this.setState({
        isRightSidebarOpen: state.isRightSidebarOpen,
      });
    });

    void this.hydrateHomeDirectory();
  }

  componentWillUnmount(): void {
    unregisterAppTestDriver(this);
    window.removeEventListener("mouseup", this.handleWindowDragEnd);
    this.unsubscribeBridge?.();
    this.unsubscribeUIStore?.();
    this.unsubscribeThemeStore?.();
    this.unsubscribeDirectoryStore?.();
    this.unsubscribeGitStore?.();
    this.unsubscribeProviderModelStore?.();
    this.unsubscribeLoggingStore?.();
    this.unsubscribeApprovalStore?.();
    this.unsubscribeChatStore?.();
    this.unsubscribeSessionCreationStore?.();
    this.unsubscribeSessionStore?.();
    if (this.gitPreviewHydrationTimeout !== undefined) {
      window.clearTimeout(this.gitPreviewHydrationTimeout);
    }
  }

  private async hydrateAvailableCommands(): Promise<void> {
    const activeSession = this.getSessionById(useSessionStore.getState().activeSessionId);
    if (!activeSession) return;
    if (!this.smokeBridge.isAvailable()) return;
    try {
      const result = await this.smokeBridge.getAvailableCommands(
        activeSession.provider,
        activeSession.id,
        activeSession.cwd,
      );
      if (!result.sessionId) return;
      this.setState((previousState) => {
        if (previousState.availableCommandsBySession[result.sessionId] !== undefined) {
          return null;
        }
        return {
          availableCommandsBySession: {
            ...previousState.availableCommandsBySession,
            [result.sessionId]: result.commands,
          },
        };
      });
    } catch {
      // Ignore — no cached commands yet.
    }
  }

  private clearNewSessionGitStatusHydration(): void {
    if (this.gitPreviewHydrationTimeout === undefined) {
      return;
    }
    window.clearTimeout(this.gitPreviewHydrationTimeout);
    this.gitPreviewHydrationTimeout = undefined;
  }

  private scheduleNewSessionGitStatusHydration(): void {
    this.clearNewSessionGitStatusHydration();
    this.gitPreviewHydrationTimeout = window.setTimeout(() => {
      this.gitPreviewHydrationTimeout = undefined;
      void this.hydrateGitStatus(useSessionCreationStore.getState().newSessionCwd);
    }, 250);
  }

  private readonly sendWindowMoveMessage = (
    messageId: "startWindowMove" | "stopWindowMove",
  ): void => {
    const electrobunWindow = window as Window & {
      __electrobunInternalBridge?: {
        postMessage: (message: string) => void;
      };
      __electrobunWindowId?: number;
    };
    const windowId = electrobunWindow.__electrobunWindowId;
    const bridge = electrobunWindow.__electrobunInternalBridge;
    if (windowId === undefined || bridge === undefined) {
      return;
    }

    const message = JSON.stringify({
      type: "message",
      id: messageId,
      payload: { id: windowId },
    });
    bridge.postMessage(JSON.stringify([message]));
  };

  private readonly handleHeaderMouseDown = (event: React.MouseEvent<HTMLElement>): void => {
    if (event.button !== 0) {
      return;
    }
    this.sendWindowMoveMessage("startWindowMove");
  };

  private readonly handleWindowDragEnd = (): void => {
    this.sendWindowMoveMessage("stopWindowMove");
  };

  private readonly setThemePreference = (nextPreference: ThemePreference): void => {
    useThemeStore.getState().setPreference(nextPreference);
  };

  private readonly handleToggleRightSidebar = (): void => {
    useUIStore.getState().toggleRightSidebar();
  };

  private readonly handleOpenRightSidebarTab = (tab: RightSidebarTabType): void => {
    this.setState((previousState) => ({
      openRightSidebarTabs: previousState.openRightSidebarTabs.includes(tab)
        ? previousState.openRightSidebarTabs
        : [...previousState.openRightSidebarTabs, tab],
      activeRightSidebarTab: tab,
    }));

    if (tab === "files") {
      void this.hydrateSessionDirectory(this.getSessionById(useSessionStore.getState().activeSessionId)?.cwd);
    }
    if (tab === "git") {
      void this.hydrateGitStatus(this.getSessionById(useSessionStore.getState().activeSessionId)?.cwd, {
        force: true,
      });
    }
  };

  private readonly handleCloseRightSidebarTab = (tab: RightSidebarTabType): void => {
    this.setState((previousState) => {
      if (!previousState.openRightSidebarTabs.includes(tab)) {
        return null;
      }
      const remaining = previousState.openRightSidebarTabs.filter((candidate) => candidate !== tab);
      const nextActive =
        previousState.activeRightSidebarTab === tab
          ? (remaining[remaining.length - 1] ?? "inspector")
          : previousState.activeRightSidebarTab;
      return {
        openRightSidebarTabs: remaining,
        activeRightSidebarTab: nextActive,
      };
    });
  };

  private readonly handleActiveRightSidebarTabChange = (tab: RightSidebarTabType): void => {
    this.setState({
      activeRightSidebarTab: tab,
    });

    if (tab === "files") {
      void this.hydrateSessionDirectory(this.getSessionById(useSessionStore.getState().activeSessionId)?.cwd);
    }
    if (tab === "git") {
      void this.hydrateGitStatus(this.getSessionById(useSessionStore.getState().activeSessionId)?.cwd, {
        force: true,
      });
    }
  };

  private readonly hydrateHomeDirectory = async (): Promise<void> => {
    if (!this.smokeBridge.isAvailable()) {
      return;
    }

    try {
      const result = await this.smokeBridge.getHomeDirectory();
      useDirectoryStore.getState().setHomeDirectory(result.path);
      const creationStore = useSessionCreationStore.getState();
      if (creationStore.newSessionCwd.trim().length === 0) {
        creationStore.setNewSessionCwd(result.path);
      }
    } catch (error) {
      this.appendLog({
        provider: useSessionStore.getState().selectedProvider,
        level: "error",
        message: error instanceof Error ? error.message : "Failed to load the home directory.",
        timestamp: new Date().toISOString(),
      });
    }
  };

  private readonly hydrateSessionDirectory = async (cwd?: string): Promise<void> => {
    const trimmedCwd = cwd?.trim();
    if (!trimmedCwd || !this.smokeBridge.isAvailable()) {
      return;
    }

    const directoryStore = useDirectoryStore.getState();
    if (directoryStore.loadingByCwd[trimmedCwd]) {
      return;
    }

    directoryStore.beginLoad(trimmedCwd);

    try {
      const result = await this.smokeBridge.listDirectory(trimmedCwd);
      useDirectoryStore.getState().completeLoad(trimmedCwd, result.entries);
    } catch (error) {
      useDirectoryStore
        .getState()
        .failLoad(
          trimmedCwd,
          error instanceof Error ? error.message : "Failed to load directory contents.",
        );
    }
  };

  private readonly hydrateGitStatus = async (
    cwd?: string,
    options?: {
      force?: boolean;
    },
  ): Promise<void> => {
    const trimmedCwd = cwd?.trim();
    if (!trimmedCwd || !this.smokeBridge.isAvailable()) {
      return;
    }

    const gitState = useGitStore.getState();
    if (gitState.loadingByCwd[trimmedCwd]) {
      return;
    }

    if (!options?.force && gitState.statusByCwd[trimmedCwd]) {
      return;
    }

    gitState.beginLoad(trimmedCwd);

    try {
      const result = await this.smokeBridge.getGitStatus(trimmedCwd);
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
        .failLoad(
          trimmedCwd,
          error instanceof Error ? error.message : "Failed to load git status.",
        );
    }
  };

  private upsertSession(sessions: readonly ChatSession[], session: ChatSession): ChatSession[] {
    const existingIndex = sessions.findIndex((item) => item.id === session.id);
    if (existingIndex < 0) {
      return [session, ...sessions];
    }
    const next = [...sessions];
    next[existingIndex] = {
      ...next[existingIndex],
      ...session,
    };
    return next;
  }

  private createSessionListItem(
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

  private getSessionById(sessionId?: string): ChatSession | undefined {
    if (!sessionId) {
      return undefined;
    }

    return useSessionStore.getState().sessions.find((session) => session.id === sessionId);
  }

  private getSessionCwd(sessionId?: string): string | undefined {
    return this.getSessionById(sessionId)?.cwd;
  }

  private getActiveProvider(): SmokeProvider {
    const activeSession = this.getSessionById(useSessionStore.getState().activeSessionId);
    return activeSession?.provider ?? useSessionStore.getState().selectedProvider;
  }

  private getLastUserMessage(sessionId?: string): ChatMessage | undefined {
    if (!sessionId) {
      return undefined;
    }
    for (let index = useChatStore.getState().chatMessages.length - 1; index >= 0; index -= 1) {
      const message = useChatStore.getState().chatMessages[index];
      if (message.sessionId === sessionId && message.author === "user") {
        return message;
      }
    }
    return undefined;
  }

  private readonly handleSelectSession = (sessionId: string): void => {
    if (
      useChatStore.getState().activeRequestId ||
      useChatStore.getState().isSending ||
      useSessionCreationStore.getState().isCreatingSession
    ) {
      return;
    }
    const selected = useSessionStore.getState().sessions.find((session) => session.id === sessionId);
    if (!selected) {
      return;
    }
    useSessionStore.getState().applySessionTransition({
      activeSessionId: selected.id,
      isDraftingSession: false,
      selectedProvider: selected.provider,
    });
    void this.hydrateGitStatus(selected.cwd, { force: true });
    void this.hydrateProviderModelCatalog(selected.provider, selected.cwd);
  };

  private readonly hydrateProviderModelCatalog = async (
    provider: SmokeProvider,
    cwd?: string,
  ): Promise<void> => {
    if (!this.smokeBridge.isAvailable()) {
      return;
    }

    try {
      const result = await this.smokeBridge.getProviderModelCatalog(provider, cwd);
      useProviderModelStore.getState().setCatalog(provider, result.catalog);
    } catch (error) {
      this.appendLog({
        provider,
        level: "error",
        message: error instanceof Error ? error.message : "Failed to load provider model catalog.",
        timestamp: new Date().toISOString(),
      });
    }
  };

  private readonly handleOpenNewSessionDialog = (): void => {
    const creationStore = useSessionCreationStore.getState();
    if (
      useChatStore.getState().activeRequestId ||
      useChatStore.getState().isSending ||
      creationStore.isCreatingSession
    ) {
      return;
    }

    const activeSession = this.getSessionById(useSessionStore.getState().activeSessionId);
    const nextProvider = activeSession?.provider ?? useSessionStore.getState().selectedProvider;
    const nextCwd = (() => {
      if (activeSession?.cwd) {
        return activeSession.cwd;
      }
      if (creationStore.newSessionCwd.trim().length > 0) {
        return creationStore.newSessionCwd;
      }
      return useDirectoryStore.getState().homeDirectory ?? "";
    })();
    creationStore.openDialog(nextProvider, nextCwd);
  };

  private readonly handleNewSessionDialogOpenChange = (open: boolean): void => {
    const creationStore = useSessionCreationStore.getState();
    if (creationStore.isCreatingSession && !open) {
      return;
    }
    creationStore.setIsNewSessionDialogOpen(open);
  };

  private readonly handleChooseWorkingDirectory = async (): Promise<void> => {
    const creationStore = useSessionCreationStore.getState();
    if (creationStore.isChoosingWorkingDirectory || !this.smokeBridge.isAvailable()) {
      return;
    }

    creationStore.setIsChoosingWorkingDirectory(true);

    try {
      const result = await this.smokeBridge.chooseWorkingDirectory(
        creationStore.newSessionCwd.trim() || useDirectoryStore.getState().homeDirectory,
      );
      const nextStore = useSessionCreationStore.getState();
      nextStore.setIsChoosingWorkingDirectory(false);
      const trimmed = result.path?.trim();
      if (trimmed) {
        nextStore.setNewSessionCwd(trimmed);
      }
    } catch (error) {
      useSessionCreationStore.getState().setIsChoosingWorkingDirectory(false);
      this.appendLog({
        provider: useSessionCreationStore.getState().newSessionProvider,
        level: "error",
        message: error instanceof Error ? error.message : "Failed to choose a working directory.",
        timestamp: new Date().toISOString(),
      });
    }
  };

  private readonly handleCreateSession = async (): Promise<void> => {
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
    if (cwd.length === 0) {
      return;
    }
    useSessionStore.getState().applySessionTransition({
      draftProvider: provider,
      selectedProvider: provider,
      isDraftingSession: false,
    });
    if (!this.smokeBridge.isAvailable()) {
      this.appendLog({
        provider,
        level: "error",
        message: "Electrobun bridge is unavailable. Launch the app with the Electrobun runtime.",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    creationStore.setIsCreatingSession(true);

    try {
      const created = await this.smokeBridge.createChatSession(provider, cwd);
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
          this.upsertSession(
            previousSessions,
            this.createSessionListItem(
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
      void this.hydrateGitStatus(created.cwd, { force: true });
      void this.hydrateProviderModelCatalog(created.provider, created.cwd);
      this.appendLog({
        provider: created.provider,
        level: "info",
        message: `Created session ${created.sessionId.slice(0, 8)} in ${created.cwd}.`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session.";
      useSessionCreationStore.getState().setIsCreatingSession(false);
      this.appendLog({
        provider,
        level: "error",
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  private readonly handleSmokeBridgeEvent = (event: SmokeBridgeEvent): void => {
    if (event.type === "chatStreamEvent") {
      this.handleChatStreamEvent(event.payload);
      return;
    }

    if (event.type === "approvalEvent") {
      this.handleApprovalEvent(event.payload);
      return;
    }

    if (event.type === "agentTranscriptEvent") {
      this.handleAgentTranscriptEvent(event.payload);
      return;
    }

    if (event.type === "availableCommandsEvent") {
      const { sessionId, commands } = event.payload;
      this.setState((previousState) => ({
        availableCommandsBySession: {
          ...previousState.availableCommandsBySession,
          [sessionId]: commands,
        },
      }));
      return;
    }

    if (event.type === "smokeEvent") {
      this.appendLog({
        provider: event.payload.provider,
        level: event.payload.level,
        message: event.payload.message,
        timestamp: event.payload.timestamp,
      });
      return;
    }

    this.appendLog({
      provider: event.payload.provider,
      level: event.payload.success ? "info" : "error",
      message: event.payload.success
        ? `Run ${event.payload.runId} finished successfully.`
        : `Run ${event.payload.runId} failed: ${event.payload.error ?? "Unknown error."}`,
      timestamp: event.payload.timestamp,
    });
  };

  private readonly handleApprovalEvent = (
    payload: Extract<SmokeBridgeEvent, { type: "approvalEvent" }>["payload"],
  ): void => {
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
      this.appendLog({
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
    this.appendLog({
      provider: payload.provider,
      level: "info",
      message:
        payload.outcome.outcome === "cancelled"
          ? `Approval ${payload.approvalId} cancelled.`
          : `Approval ${payload.approvalId} answered with ${payload.outcome.optionId}.`,
      timestamp: payload.timestamp,
    });
  };

  private readonly handleAgentTranscriptEvent = (
    payload: Extract<SmokeBridgeEvent, { type: "agentTranscriptEvent" }>["payload"],
  ): void => {
    useLoggingStore.getState().appendTranscriptEntry(payload);
  };

  private readonly handleChatStreamEvent = (
    payload: Extract<SmokeBridgeEvent, { type: "chatStreamEvent" }>["payload"],
  ): void => {
    if (payload.kind === "session_ready") {
      useSessionStore.getState().applySessionTransition({
        activeSessionId: payload.sessionId,
        isDraftingSession: false,
        draftProvider: payload.provider,
        selectedProvider: payload.provider,
        sessions: (previousSessions) =>
          this.upsertSession(
            previousSessions,
            this.createSessionListItem(
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
      void this.hydrateGitStatus(payload.cwd, { force: true });
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
      this.appendLog({
        provider: payload.provider,
        level: "info",
        message: `Request ${payload.requestId.slice(0, 8)} completed (${
          payload.stopReason ?? "unknown"
        }).`,
        timestamp: payload.timestamp,
      });
      void this.hydrateGitStatus(payload.cwd, { force: true });
      return;
    }

    if (payload.kind !== "error") {
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
      };
      return {
        isCancellingRequest: false,
        activeRequestId:
          prev.activeRequestId === payload.requestId ? undefined : prev.activeRequestId,
        chatMessages: nextMessages,
      };
    });
    this.appendLog({
      provider: payload.provider,
      level: "error",
      message: payload.text ?? "Request failed.",
      timestamp: payload.timestamp,
    });
    void this.hydrateGitStatus(payload.cwd, { force: true });
  };

  private readonly handleStopActiveRequest = async (): Promise<void> => {
    if (
      !useChatStore.getState().activeRequestId ||
      !useSessionStore.getState().activeSessionId ||
      useChatStore.getState().isCancellingRequest
    ) {
      return;
    }

    const provider = this.getActiveProvider();
    useChatStore.getState().setIsCancellingRequest(true);

    try {
      const result = await this.smokeBridge.cancelChatMessage(
        provider,
        useSessionStore.getState().activeSessionId,
        useChatStore.getState().activeRequestId,
        this.getSessionCwd(useSessionStore.getState().activeSessionId),
      );
      this.appendLog({
        provider: result.provider,
        level: "info",
        message: `Cancellation requested for ${result.requestId.slice(0, 8)}.`,
        timestamp: result.cancelledAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cancel request.";
      useChatStore.getState().setIsCancellingRequest(false);
      this.appendLog({
        provider,
        level: "error",
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  private readonly handleRespondToApproval = async (
    approvalId: string,
    outcome: ApprovalOutcome,
  ): Promise<void> => {
    const approvalStore = useApprovalStore.getState();
    const approval = approvalStore.pendingApprovals.find(
      (entry) => entry.approvalId === approvalId,
    );
    const provider = approval?.provider ?? this.getActiveProvider();
    approvalStore.setRespondingApprovalId(approvalId);

    try {
      await this.smokeBridge.respondToApproval(
        provider,
        approvalId,
        outcome,
        approval?.cwd ?? this.getSessionCwd(approval?.sessionId),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to answer approval request.";
      useApprovalStore.getState().setRespondingApprovalId(undefined);
      this.appendLog({
        provider,
        level: "error",
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  private readonly handleRetryLastMessage = async (): Promise<void> => {
    if (
      useChatStore.getState().isSending ||
      useChatStore.getState().activeRequestId ||
      useSessionCreationStore.getState().isCreatingSession
    ) {
      return;
    }

    const lastUserMessage = this.getLastUserMessage(useSessionStore.getState().activeSessionId);
    if (!lastUserMessage) {
      return;
    }

    await this.handleSendMessage(lastUserMessage.text);
  };

  private readonly handleSendMessage = async (messageOverride?: string): Promise<void> => {
    if (useChatStore.getState().activeRequestId || useChatStore.getState().isSending) {
      return;
    }
    const messageText = (messageOverride ?? useChatStore.getState().chatInput).trim();
    if (messageText.length === 0) {
      return;
    }
    if (!useSessionStore.getState().activeSessionId) {
      return;
    }
    const activeSession = this.getSessionById(useSessionStore.getState().activeSessionId);
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

    if (!this.smokeBridge.isAvailable()) {
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
      const result = await this.smokeBridge.sendChatMessage(
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
                  ? {
                      ...message,
                      requestId: result.requestId,
                      sessionId: result.sessionId,
                    }
                  : message,
              )
            : [
                ...prev.chatMessages.map((message) =>
                  message.id === userMessageId
                    ? {
                        ...message,
                        requestId: result.requestId,
                        sessionId: result.sessionId,
                      }
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
          this.upsertSession(
            previousSessions,
            this.createSessionListItem(
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
      void this.hydrateGitStatus(result.cwd, { force: true });
      void this.hydrateProviderModelCatalog(result.provider, result.cwd);
      this.appendLog({
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
  };

  private appendLog(input: Omit<SmokeLogLine, "id">): void {
    useLoggingStore.getState().appendLog(input);
  }

  async getSnapshot(): Promise<AppTestSnapshot> {
    const activeSession = this.getSessionById(useSessionStore.getState().activeSessionId);
    const visibleMessages = useSessionStore.getState().activeSessionId
      ? useChatStore
          .getState()
          .chatMessages.filter((message) => message.sessionId === useSessionStore.getState().activeSessionId)
      : [];

    const sessions: AppTestSessionSnapshot[] = useSessionStore.getState().sessions.map((session) => ({
      id: session.id,
      provider: session.provider,
      title: session.title,
      model: session.model,
      cwd: session.cwd,
    }));
    const messageSnapshots: AppTestMessageSnapshot[] = visibleMessages.map((message) => ({
      author: message.author,
      provider: message.provider,
      requestId: message.requestId,
      sessionId: message.sessionId,
      text: message.text,
      status: message.status,
    }));
    const approvalSnapshots: AppTestApprovalSnapshot[] = useApprovalStore
      .getState()
      .pendingApprovals.map((approval) => ({
        approvalId: approval.approvalId,
        provider: approval.provider,
        sessionId: approval.sessionId,
        requestId: approval.requestId,
        optionIds: approval.options.map((option) => option.optionId),
      }));

    const loggingState = useLoggingStore.getState();
    const visibleTranscriptEntries = useSessionStore.getState().activeSessionId
      ? loggingState.transcriptEntries.filter(
          (entry) =>
            entry.sessionId === useSessionStore.getState().activeSessionId ||
            (!entry.sessionId &&
              entry.provider === (activeSession?.provider ?? useSessionStore.getState().selectedProvider)),
        )
      : loggingState.transcriptEntries.filter(
          (entry) => entry.provider === useSessionStore.getState().selectedProvider,
        );

    return {
      ready: true,
      isSending: useChatStore.getState().isSending,
      isCreatingSession: useSessionCreationStore.getState().isCreatingSession,
      isCancellingRequest: useChatStore.getState().isCancellingRequest,
      isNewSessionDialogOpen: useSessionCreationStore.getState().isNewSessionDialogOpen,
      activeRequestId: useChatStore.getState().activeRequestId,
      activeSessionId: useSessionStore.getState().activeSessionId,
      selectedProvider: useSessionStore.getState().selectedProvider,
      sessions,
      visibleMessages: messageSnapshots,
      pendingApprovals: approvalSnapshots,
      transcriptEntryCount: visibleTranscriptEntries.length,
      runtimeLogCount: loggingState.logs.length,
    };
  }

  async waitForState(params: AppTestWaitForStateParams): Promise<AppTestSnapshot> {
    const timeoutMs = params.timeoutMs ?? 5000;
    const pollIntervalMs = params.pollIntervalMs ?? 25;
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const snapshot = await this.getSnapshot();
      if (matchesTestWaitState(snapshot, params)) {
        return snapshot;
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, pollIntervalMs);
      });
    }

    throw new Error(
      `Timed out waiting for app state after ${timeoutMs}ms: ${JSON.stringify(params)}`,
    );
  }

  async performAction(action: AppTestAction): Promise<AppTestSnapshot> {
    if (action.type === "resetApp") {
      await new Promise<void>((resolve) => {
        const homeDirectory = useDirectoryStore.getState().homeDirectory;
        useSessionCreationStore.setState({
          newSessionCwd: homeDirectory ?? "",
          newSessionProvider: "codex",
          isCreatingSession: false,
          isChoosingWorkingDirectory: false,
          isNewSessionDialogOpen: false,
        });
        useSessionStore.setState({
          sessions: [],
          activeSessionId: undefined,
          selectedProvider: "codex",
          draftProvider: "codex",
          isDraftingSession: false,
        });
        this.setState(
          this.createInitialState({
            isRightSidebarOpen: this.state.isRightSidebarOpen,
          }),
          () => resolve(),
        );
      });
      return this.getSnapshot();
    }

    if (action.type === "createSession") {
      useSessionCreationStore.setState({
        isNewSessionDialogOpen: true,
        newSessionProvider: action.provider,
        newSessionCwd: action.cwd,
      });
      await this.handleCreateSession();
      return this.getSnapshot();
    }

    if (action.type === "selectSession") {
      this.handleSelectSession(action.sessionId);
      return this.getSnapshot();
    }

    if (action.type === "typeComposer") {
      useChatStore.getState().setChatInput(action.text);
      return this.getSnapshot();
    }

    if (action.type === "submitComposer") {
      await this.handleSendMessage();
      return this.getSnapshot();
    }

    if (action.type === "cancelActiveRequest") {
      await this.handleStopActiveRequest();
      return this.getSnapshot();
    }

    const approval = useApprovalStore
      .getState()
      .pendingApprovals.find((entry) => entry.approvalId === action.approvalId);
    if (!approval) {
      throw new Error(`Unknown approval request: ${action.approvalId}`);
    }
    await this.handleRespondToApproval(action.approvalId, {
      outcome: "selected",
      optionId: action.optionId,
    });
    return this.getSnapshot();
  }

  render(): React.ReactNode {
    const sessionState = useSessionStore.getState();
    const { selectedProvider, draftProvider, activeSessionId } = sessionState;
    const activeSession = this.getSessionById(activeSessionId);
    const activeProvider = activeSession?.provider ?? selectedProvider;
    const providerModelState = useProviderModelStore.getState();
    const selectedCatalog = providerModelState.catalogs[activeProvider];
    const selectedModelState = getProviderModelSelection(
      providerModelState.selected[activeProvider],
      selectedCatalog,
    );
    const modelOptions = getProviderModelOptions(selectedCatalog);
    const modelHelperText = getProviderModelHelperText(selectedCatalog);
    const selectedProviderLabel = getSmokeProviderLabel(activeProvider);
    const draftProviderLabel = getSmokeProviderLabel(draftProvider);
    const hasActiveSession = Boolean(activeSessionId);
    const isBusy =
      Boolean(useChatStore.getState().activeRequestId) ||
      useChatStore.getState().isSending ||
      useSessionCreationStore.getState().isCreatingSession ||
      useChatStore.getState().isCancellingRequest;
    const canStopActiveRequest =
      Boolean(useChatStore.getState().activeRequestId) &&
      Boolean(activeSessionId) &&
      !useChatStore.getState().isCancellingRequest;
    const showStopAction =
      useChatStore.getState().isSending || Boolean(useChatStore.getState().activeRequestId);
    const lastUserMessage = this.getLastUserMessage(activeSessionId);
    const approvalState = useApprovalStore.getState();
    const currentApproval = approvalState.pendingApprovals[0];
    const loggingState = useLoggingStore.getState();
    const activeUsage = activeSessionId
      ? loggingState.usageBySessionId[activeSessionId]
      : undefined;
    const isRightSidebarOpen = this.state.isRightSidebarOpen;
    const visibleTranscriptEntries = activeSessionId
      ? loggingState.transcriptEntries.filter(
          (entry) =>
            entry.sessionId === activeSessionId ||
            (!entry.sessionId && entry.provider === activeProvider),
        )
      : loggingState.transcriptEntries.filter((entry) => entry.provider === draftProvider);
    const newestTranscriptEntriesFirst = visibleTranscriptEntries.slice().reverse();
    const newestLogsFirst = loggingState.logs.slice().reverse();
    const visibleMessages = activeSessionId
      ? useChatStore
          .getState()
          .chatMessages.filter((message) => message.sessionId === activeSessionId)
      : [];
    const activeSessionCwd = activeSession?.cwd;
    const directoryState = useDirectoryStore.getState();
    const directoryEntries = activeSessionCwd
      ? (directoryState.entriesByCwd[activeSessionCwd] ?? [])
      : [];
    const directoryError = activeSessionCwd
      ? directoryState.errorsByCwd[activeSessionCwd]
      : undefined;
    const isDirectoryLoading = activeSessionCwd
      ? Boolean(directoryState.loadingByCwd[activeSessionCwd])
      : false;
    const gitStoreState = useGitStore.getState();
    const activeGitStatus = activeSessionCwd
      ? gitStoreState.statusByCwd[activeSessionCwd]
      : undefined;
    const activeGitStatusError = activeSessionCwd
      ? gitStoreState.errorsByCwd[activeSessionCwd]
      : undefined;
    const isActiveGitStatusLoading = activeSessionCwd
      ? Boolean(gitStoreState.loadingByCwd[activeSessionCwd])
      : false;
    const newSessionTrimmedCwd = useSessionCreationStore.getState().newSessionCwd.trim();
    const newSessionGitStatus = newSessionTrimmedCwd
      ? gitStoreState.statusByCwd[newSessionTrimmedCwd]
      : undefined;
    const newSessionGitStatusError = newSessionTrimmedCwd
      ? gitStoreState.errorsByCwd[newSessionTrimmedCwd]
      : undefined;
    const isNewSessionGitStatusLoading = newSessionTrimmedCwd
      ? Boolean(gitStoreState.loadingByCwd[newSessionTrimmedCwd])
      : false;
    const rightSidebarTabContent: Record<RightSidebarTabType, React.ReactNode> = {
      inspector: (
        <div className="flex min-h-0 flex-col gap-4">
          <InspectorPanel
            contextWindow={activeSessionId ? "live session" : "not started"}
            activeRequestId={useChatStore.getState().activeRequestId}
            canRetry={Boolean(lastUserMessage) && !isBusy}
            canStop={canStopActiveRequest}
            isStopping={useChatStore.getState().isCancellingRequest}
            isWorking={showStopAction}
            modelName={hasActiveSession ? selectedProviderLabel : draftProviderLabel}
            onRetry={() => {
              void this.handleRetryLastMessage();
            }}
            onStop={() => {
              void this.handleStopActiveRequest();
            }}
            pendingApprovalCount={approvalState.pendingApprovals.length}
            transcriptEntries={newestTranscriptEntriesFirst}
          />

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Runtime events
            </h2>
            <div className="rounded-md border border-border bg-muted/40 p-2">
              {newestLogsFirst.length === 0 ? (
                <p className="text-xs text-muted-foreground">No runtime events yet.</p>
              ) : (
                <ul className="space-y-1">
                  {newestLogsFirst.map((line) => (
                    <li className="text-xs" key={line.id}>
                      <span className="text-muted-foreground">
                        [{new Date(line.timestamp).toLocaleTimeString()}]
                      </span>{" "}
                      <span className="font-medium uppercase text-muted-foreground">
                        {line.provider}
                      </span>{" "}
                      <span
                        className={
                          line.level === "error"
                            ? "text-destructive"
                            : line.level === "info"
                              ? "text-primary"
                              : "text-foreground"
                        }
                      >
                        {line.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      ),
      files: (
        <FilesPanel
          cwd={activeSessionCwd}
          entries={directoryEntries}
          error={directoryError}
          isLoading={isDirectoryLoading}
          onRefresh={() => {
            void this.hydrateSessionDirectory(activeSessionCwd);
          }}
        />
      ),
      git: (
        <GitPanel
          cwd={activeSessionCwd}
          gitStatus={activeGitStatus}
          gitStatusError={activeGitStatusError}
          isGitStatusLoading={isActiveGitStatusLoading}
          onRefreshGitStatus={async (cwd) => {
            await this.hydrateGitStatus(cwd, {
              force: true,
            });
          }}
          smokeBridge={this.smokeBridge}
        />
      ),
    };

    return (
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background px-2 pb-2 pt-2 text-foreground">
        <header
          className="mb-2 flex flex-none items-center justify-between gap-4 shadow-sm backdrop-blur electrobun-webkit-app-region-drag"
          onMouseDown={this.handleHeaderMouseDown}
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div />
          <div
            className="electrobun-webkit-app-region-no-drag flex items-center gap-2"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>Theme</span>
              <Select
                onValueChange={(value) => this.setThemePreference(value as ThemePreference)}
                value={useThemeStore.getState().preference}
              >
                <SelectTrigger aria-label="Theme" className="min-w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <Button
              aria-label={isRightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"}
              onClick={this.handleToggleRightSidebar}
              size="icon-sm"
              title={isRightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"}
              variant="outline"
            >
              {isRightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
          </div>
        </header>

        <ResizableMainLayout
          isRightSidebarOpen={isRightSidebarOpen}
          left={
            <SessionListPanel
              activeSessionId={activeSessionId}
              onCreateSession={this.handleOpenNewSessionDialog}
              onSelectSession={this.handleSelectSession}
              disabled={isBusy}
              sessions={useSessionStore.getState().sessions}
            />
          }
          center={
            <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Chat
                  </h2>
                  {activeSession?.cwd ? (
                    <div className="space-y-1">
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {activeSession.cwd}
                      </p>
                      {activeGitStatus?.isGitRepository ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{getGitBranchLabel(activeGitStatus)}</Badge>
                          <span>
                            {activeGitStatus.files.length === 0
                              ? "Clean working tree"
                              : formatGitChangeBreakdown(activeGitStatus.summary) ||
                                `${activeGitStatus.files.length} changed`}
                          </span>
                        </div>
                      ) : isActiveGitStatusLoading ? (
                        <p className="text-xs text-muted-foreground">Inspecting git status...</p>
                      ) : activeGitStatusError ? (
                        <p className="text-xs text-destructive">{activeGitStatusError}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {activeUsage ? (
                  <p className="text-xs text-muted-foreground">
                    Context {formatCount(activeUsage.used)} / {formatCount(activeUsage.size)}
                  </p>
                ) : null}
              </div>

              {!hasActiveSession ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
                  Create or select a session to start chatting.
                </div>
              ) : (
                <>
                  <ChatSurface messages={visibleMessages} />

                  <label className="mb-2 block text-xs font-medium text-muted-foreground">
                    Message for {selectedProviderLabel}
                  </label>
                  <ChatComposer
                    bridge={this.smokeBridge}
                    cwd={activeSession?.cwd}
                    availableCommands={
                      activeSession
                        ? this.state.availableCommandsBySession[activeSession.id]
                        : undefined
                    }
                    disabled={isBusy}
                    onChange={(markdown) => useChatStore.getState().setChatInput(markdown)}
                    onSubmit={() => void this.handleSendMessage()}
                    placeholder="Type a prompt. Use @ to mention files, / for commands. Press Enter to send."
                    value={useChatStore.getState().chatInput}
                  />
                  <div className="mt-3 flex items-end gap-3">
                    <div className="flex-1">
                      <label className="mb-2 block text-xs font-medium text-muted-foreground">
                        Model
                      </label>
                      <Select
                        disabled={isBusy}
                        onValueChange={(value) =>
                          useProviderModelStore
                            .getState()
                            .setSelectedModel(
                              activeProvider,
                              resolveProviderModelSelection(
                                value === DEFAULT_MODEL_VALUE || value == null ? "" : value,
                                selectedModelState.selectedThinkingLevelValue,
                                selectedCatalog,
                              ),
                            )
                        }
                        value={selectedModelState.modelValue || DEFAULT_MODEL_VALUE}
                      >
                        <SelectTrigger aria-label="Model" className="w-full">
                          <SelectValue placeholder="Default model">
                            {(value) => (value === DEFAULT_MODEL_VALUE ? "Default model" : value)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={DEFAULT_MODEL_VALUE}>Default model</SelectItem>
                            {modelOptions.map((modelOption) => (
                              <SelectItem key={modelOption.id} value={modelOption.id}>
                                {modelOption.title ?? modelOption.id}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedModelState.thinkingLevelOptions.length > 0 ? (
                      <div className="flex-1">
                        <label className="mb-2 block text-xs font-medium text-muted-foreground">
                          Thinking level
                        </label>
                        <Select
                          disabled={isBusy}
                          onValueChange={(value) =>
                            useProviderModelStore
                              .getState()
                              .setSelectedModel(
                                activeProvider,
                                resolveProviderModelSelection(
                                  selectedModelState.modelValue,
                                  value ?? selectedModelState.selectedThinkingLevelValue,
                                  selectedCatalog,
                                ),
                              )
                          }
                          value={selectedModelState.selectedThinkingLevelValue}
                        >
                          <SelectTrigger aria-label="Thinking level" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {selectedModelState.thinkingLevelOptions.map((level) => (
                                <SelectItem key={level.id} value={level.id}>
                                  {level.title}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    <PrimaryButton
                      disabled={
                        useSessionCreationStore.getState().isCreatingSession ||
                        (showStopAction
                          ? !canStopActiveRequest
                          : useChatStore.getState().chatInput.trim().length === 0)
                      }
                      label={
                        showStopAction
                          ? useChatStore.getState().isCancellingRequest
                            ? "Stopping..."
                            : "Stop"
                          : "Send"
                      }
                      onClick={() => {
                        if (showStopAction) {
                          void this.handleStopActiveRequest();
                          return;
                        }
                        void this.handleSendMessage();
                      }}
                    />
                  </div>
                  {modelHelperText ? (
                    <p className="mt-2 text-xs text-muted-foreground">{modelHelperText}</p>
                  ) : null}
                </>
              )}
            </section>
          }
          right={
            <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              <RightSidebarTabs
                activeTab={this.state.activeRightSidebarTab}
                onActiveTabChange={this.handleActiveRightSidebarTabChange}
                onCloseTab={this.handleCloseRightSidebarTab}
                onOpenTab={this.handleOpenRightSidebarTab}
                openTabs={this.state.openRightSidebarTabs}
                tabContent={rightSidebarTabContent}
              />
            </div>
          }
        />
        <NewSessionDialog
          cwd={useSessionCreationStore.getState().newSessionCwd}
          gitStatus={newSessionGitStatus}
          gitStatusError={newSessionGitStatusError}
          isCreating={useSessionCreationStore.getState().isCreatingSession}
          isGitStatusLoading={isNewSessionGitStatusLoading}
          isChoosingWorkingDirectory={useSessionCreationStore.getState().isChoosingWorkingDirectory}
          onRefreshGitStatus={async (cwd) => {
            await this.hydrateGitStatus(cwd, {
              force: true,
            });
          }}
          onChooseWorkingDirectory={() => {
            void this.handleChooseWorkingDirectory();
          }}
          onCwdChange={(cwd) => {
            useSessionCreationStore.getState().setNewSessionCwd(cwd);
          }}
          onOpenChange={this.handleNewSessionDialogOpenChange}
          onProviderChange={(provider) => {
            useSessionCreationStore.getState().setNewSessionProvider(provider);
          }}
          onSubmit={() => {
            void this.handleCreateSession();
          }}
          open={useSessionCreationStore.getState().isNewSessionDialogOpen}
          provider={useSessionCreationStore.getState().newSessionProvider}
          smokeBridge={this.smokeBridge}
        />
        <ApprovalDialog
          approval={currentApproval}
          isResponding={approvalState.respondingApprovalId === currentApproval?.approvalId}
          onSelectOption={(optionId) => {
            if (!currentApproval) {
              return;
            }
            void this.handleRespondToApproval(currentApproval.approvalId, {
              outcome: "selected",
              optionId,
            });
          }}
        />
      </main>
    );
  }
}
