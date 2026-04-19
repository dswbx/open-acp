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
import type { ProviderModelCatalog, SmokeProvider } from "../shared/AppRPC.ts";
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
  createInitialProviderModelCatalogs,
  getProviderModelHelperText,
  getProviderModelSelection,
  getProviderModelOptions,
  getSelectedModelValue,
  resolveProviderModelSelection,
} from "./providerModelCatalogState.ts";
import {
  readStoredThemePreference,
  resolveThemeMode,
  writeStoredThemePreference,
  type ThemeMode,
  type ThemePreference,
} from "./theme/themePreference.ts";
import { ApprovalDialog } from "./components/ApprovalDialog.tsx";
import { formatToolPresentation, toToolActionLabel } from "./chat/toolPresentation.ts";
import { useUIStore } from "./state/uiStore.ts";
import type {
  AgentTranscriptEventPayload,
  ApprovalEventPayload,
  ApprovalOutcome,
  AvailableCommand,
  ChatToolCallState,
  GetGitStatusResult,
  GitStatusSummary,
  SessionDirectoryEntry,
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

interface SmokeLogLine {
  id: string;
  level: "info" | "update" | "error";
  message: string;
  provider: SmokeProvider;
  timestamp: string;
}

interface ChatSession extends SessionListItem {
  provider: SmokeProvider;
}

interface AppState {
  sessions: ChatSession[];
  chatMessages: ChatMessage[];
  chatInput: string;
  draftProvider: SmokeProvider;
  newSessionProvider: SmokeProvider;
  newSessionCwd: string;
  homeDirectory?: string;
  providerModelCatalogs: Record<SmokeProvider, ProviderModelCatalog>;
  selectedModels: Record<SmokeProvider, string>;
  isSending: boolean;
  isCancellingRequest: boolean;
  isCreatingSession: boolean;
  isChoosingWorkingDirectory: boolean;
  isDraftingSession: boolean;
  isNewSessionDialogOpen: boolean;
  activeRequestId?: string;
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  logs: SmokeLogLine[];
  sessionUsageBySessionId: Record<
    string,
    {
      used: number;
      size: number;
      timestamp: string;
    }
  >;
  transcriptEntries: AgentTranscriptEventPayload[];
  pendingApprovals: Extract<ApprovalEventPayload, { kind: "requested" }>[];
  openRightSidebarTabs: RightSidebarTabType[];
  activeRightSidebarTab: RightSidebarTabType;
  sessionDirectoryEntriesByCwd: Record<string, SessionDirectoryEntry[]>;
  sessionDirectoryErrorsByCwd: Record<string, string | undefined>;
  sessionDirectoryLoadingByCwd: Record<string, boolean | undefined>;
  gitStatusByCwd: Record<string, GetGitStatusResult | undefined>;
  gitStatusErrorsByCwd: Record<string, string | undefined>;
  gitStatusLoadingByCwd: Record<string, boolean | undefined>;
  respondingApprovalId?: string;
  availableCommandsBySession: Record<string, AvailableCommand[]>;
  themePreference: ThemePreference;
  themeMode: ThemeMode;
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
  private systemThemeQuery?: MediaQueryList;
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
      sessions: [],
      chatMessages: [],
      chatInput: "",
      draftProvider: "codex",
      newSessionProvider: "codex",
      newSessionCwd: "",
      providerModelCatalogs: createInitialProviderModelCatalogs(),
      selectedModels: {
        codex: "",
        claude: "",
        qwen: "",
        opencode: "",
      },
      isSending: false,
      isCancellingRequest: false,
      isCreatingSession: false,
      isChoosingWorkingDirectory: false,
      isDraftingSession: false,
      isNewSessionDialogOpen: false,
      selectedProvider: "codex",
      logs: [],
      sessionUsageBySessionId: {},
      transcriptEntries: [],
      pendingApprovals: [],
      openRightSidebarTabs: ["inspector"],
      activeRightSidebarTab: "inspector",
      sessionDirectoryEntriesByCwd: {},
      sessionDirectoryErrorsByCwd: {},
      sessionDirectoryLoadingByCwd: {},
      gitStatusByCwd: {},
      gitStatusErrorsByCwd: {},
      gitStatusLoadingByCwd: {},
      availableCommandsBySession: {},
      themePreference: "system",
      themeMode: "light",
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
    this.unsubscribeUIStore = useUIStore.subscribe((state) => {
      if (state.isRightSidebarOpen === this.state.isRightSidebarOpen) {
        return;
      }
      this.setState({
        isRightSidebarOpen: state.isRightSidebarOpen,
      });
    });

    this.systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    this.systemThemeQuery.addEventListener("change", this.handleSystemThemeChange);

    const storedPreference = readStoredThemePreference();
    const storedMode = resolveThemeMode(storedPreference, this.systemThemeQuery.matches);
    this.applyThemeMode(storedMode);
    this.setState({
      themePreference: storedPreference,
      themeMode: storedMode,
    });
    void this.hydrateHomeDirectory();
  }

  componentWillUnmount(): void {
    unregisterAppTestDriver(this);
    window.removeEventListener("mouseup", this.handleWindowDragEnd);
    this.unsubscribeBridge?.();
    this.unsubscribeUIStore?.();
    this.systemThemeQuery?.removeEventListener("change", this.handleSystemThemeChange);
    if (this.gitPreviewHydrationTimeout !== undefined) {
      window.clearTimeout(this.gitPreviewHydrationTimeout);
    }
  }

  componentDidUpdate(_prevProps: AppProps, prevState: AppState): void {
    const previousActiveCwd =
      prevState.sessions.find((session) => session.id === prevState.activeSessionId)?.cwd ?? "";
    const activeCwd = this.getSessionById(this.state.activeSessionId)?.cwd ?? "";
    const hasFilesTabOpen = this.state.openRightSidebarTabs.includes("files");

    if (hasFilesTabOpen && activeCwd.length > 0 && activeCwd !== previousActiveCwd) {
      void this.hydrateSessionDirectory(activeCwd);
    }

    if (activeCwd.length > 0 && activeCwd !== previousActiveCwd) {
      void this.hydrateGitStatus(activeCwd, { force: true });
    }

    const activeSessionId = this.state.activeSessionId;
    if (
      activeSessionId &&
      activeCwd.length > 0 &&
      !this.filesAutoOpenedForSessions.has(activeSessionId)
    ) {
      this.filesAutoOpenedForSessions.add(activeSessionId);
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
      activeSessionId &&
      activeCwd.length > 0 &&
      !this.gitAutoOpenedForSessions.has(activeSessionId)
    ) {
      const gitStatus = this.state.gitStatusByCwd[activeCwd];
      if (gitStatus?.isGitRepository) {
        this.gitAutoOpenedForSessions.add(activeSessionId);
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
      this.state.activeSessionId &&
      this.state.activeSessionId !== prevState.activeSessionId &&
      this.state.availableCommandsBySession[this.state.activeSessionId] === undefined
    ) {
      void this.hydrateAvailableCommands();
    }

    if (this.state.isNewSessionDialogOpen) {
      const dialogJustOpened = !prevState.isNewSessionDialogOpen;
      const cwdChanged = prevState.newSessionCwd !== this.state.newSessionCwd;
      if (dialogJustOpened || cwdChanged) {
        this.scheduleNewSessionGitStatusHydration();
      }
    } else if (prevState.isNewSessionDialogOpen) {
      this.clearNewSessionGitStatusHydration();
    }
  }

  private async hydrateAvailableCommands(): Promise<void> {
    const activeSession = this.getSessionById(this.state.activeSessionId);
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
      void this.hydrateGitStatus(this.state.newSessionCwd);
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

  private applyThemeMode(mode: ThemeMode): void {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }

  private readonly handleSystemThemeChange = (): void => {
    if (this.state.themePreference !== "system") {
      return;
    }
    const mode = resolveThemeMode("system", this.systemThemeQuery?.matches ?? false);
    this.applyThemeMode(mode);
    this.setState({
      themeMode: mode,
    });
  };

  private readonly setThemePreference = (nextPreference: ThemePreference): void => {
    writeStoredThemePreference(nextPreference);
    const mode = resolveThemeMode(nextPreference, this.systemThemeQuery?.matches ?? false);
    this.applyThemeMode(mode);
    this.setState({
      themePreference: nextPreference,
      themeMode: mode,
    });
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
      void this.hydrateSessionDirectory(this.getSessionById(this.state.activeSessionId)?.cwd);
    }
    if (tab === "git") {
      void this.hydrateGitStatus(this.getSessionById(this.state.activeSessionId)?.cwd, {
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
      void this.hydrateSessionDirectory(this.getSessionById(this.state.activeSessionId)?.cwd);
    }
    if (tab === "git") {
      void this.hydrateGitStatus(this.getSessionById(this.state.activeSessionId)?.cwd, {
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
      this.setState((previousState) => ({
        homeDirectory: result.path,
        newSessionCwd:
          previousState.newSessionCwd.trim().length > 0 ? previousState.newSessionCwd : result.path,
      }));
    } catch (error) {
      this.appendLog({
        provider: this.state.selectedProvider,
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

    if (this.state.sessionDirectoryLoadingByCwd[trimmedCwd]) {
      return;
    }

    this.setState((previousState) => ({
      sessionDirectoryLoadingByCwd: {
        ...previousState.sessionDirectoryLoadingByCwd,
        [trimmedCwd]: true,
      },
      sessionDirectoryErrorsByCwd: {
        ...previousState.sessionDirectoryErrorsByCwd,
        [trimmedCwd]: undefined,
      },
    }));

    try {
      const result = await this.smokeBridge.listDirectory(trimmedCwd);
      this.setState((previousState) => ({
        sessionDirectoryEntriesByCwd: {
          ...previousState.sessionDirectoryEntriesByCwd,
          [trimmedCwd]: result.entries,
        },
        sessionDirectoryLoadingByCwd: {
          ...previousState.sessionDirectoryLoadingByCwd,
          [trimmedCwd]: false,
        },
      }));
    } catch (error) {
      this.setState((previousState) => ({
        sessionDirectoryLoadingByCwd: {
          ...previousState.sessionDirectoryLoadingByCwd,
          [trimmedCwd]: false,
        },
        sessionDirectoryErrorsByCwd: {
          ...previousState.sessionDirectoryErrorsByCwd,
          [trimmedCwd]:
            error instanceof Error ? error.message : "Failed to load directory contents.",
        },
      }));
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

    if (this.state.gitStatusLoadingByCwd[trimmedCwd]) {
      return;
    }

    if (!options?.force && this.state.gitStatusByCwd[trimmedCwd]) {
      return;
    }

    this.setState((previousState) => ({
      gitStatusLoadingByCwd: {
        ...previousState.gitStatusLoadingByCwd,
        [trimmedCwd]: true,
      },
      gitStatusErrorsByCwd: {
        ...previousState.gitStatusErrorsByCwd,
        [trimmedCwd]: undefined,
      },
    }));

    try {
      const result = await this.smokeBridge.getGitStatus(trimmedCwd);
      this.setState((previousState) => ({
        gitStatusByCwd: {
          ...previousState.gitStatusByCwd,
          [trimmedCwd]: result,
        },
        gitStatusLoadingByCwd: {
          ...previousState.gitStatusLoadingByCwd,
          [trimmedCwd]: false,
        },
        sessions: previousState.sessions.map((session) =>
          session.cwd === trimmedCwd
            ? {
                ...session,
                gitBranch: getGitBranchLabel(result),
                gitStatusSummary: formatGitSessionSummary(result),
              }
            : session,
        ),
      }));
    } catch (error) {
      this.setState((previousState) => ({
        gitStatusLoadingByCwd: {
          ...previousState.gitStatusLoadingByCwd,
          [trimmedCwd]: false,
        },
        gitStatusErrorsByCwd: {
          ...previousState.gitStatusErrorsByCwd,
          [trimmedCwd]: error instanceof Error ? error.message : "Failed to load git status.",
        },
      }));
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

    return this.state.sessions.find((session) => session.id === sessionId);
  }

  private getSessionCwd(sessionId?: string): string | undefined {
    return this.getSessionById(sessionId)?.cwd;
  }

  private getActiveProvider(): SmokeProvider {
    const activeSession = this.getSessionById(this.state.activeSessionId);
    return activeSession?.provider ?? this.state.selectedProvider;
  }

  private getLastUserMessage(sessionId?: string): ChatMessage | undefined {
    if (!sessionId) {
      return undefined;
    }
    for (let index = this.state.chatMessages.length - 1; index >= 0; index -= 1) {
      const message = this.state.chatMessages[index];
      if (message.sessionId === sessionId && message.author === "user") {
        return message;
      }
    }
    return undefined;
  }

  private readonly handleSelectSession = (sessionId: string): void => {
    if (this.state.activeRequestId || this.state.isSending || this.state.isCreatingSession) {
      return;
    }
    const selected = this.state.sessions.find((session) => session.id === sessionId);
    if (!selected) {
      return;
    }
    this.setState({
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
      this.setState((previousState) => ({
        providerModelCatalogs: {
          ...previousState.providerModelCatalogs,
          [provider]: result.catalog,
        },
        selectedModels: {
          ...previousState.selectedModels,
          [provider]: getSelectedModelValue(previousState.selectedModels[provider], result.catalog),
        },
      }));
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
    if (this.state.activeRequestId || this.state.isSending || this.state.isCreatingSession) {
      return;
    }

    const activeSession = this.getSessionById(this.state.activeSessionId);
    this.setState((previousState) => ({
      isNewSessionDialogOpen: true,
      newSessionProvider: activeSession?.provider ?? previousState.selectedProvider,
      newSessionCwd: (() => {
        if (activeSession?.cwd) {
          return activeSession.cwd;
        }
        if (previousState.newSessionCwd.trim().length > 0) {
          return previousState.newSessionCwd;
        }
        return previousState.homeDirectory ?? "";
      })(),
    }));
  };

  private readonly handleNewSessionDialogOpenChange = (open: boolean): void => {
    if (this.state.isCreatingSession && !open) {
      return;
    }

    this.setState({
      isNewSessionDialogOpen: open,
    });
  };

  private readonly handleChooseWorkingDirectory = async (): Promise<void> => {
    if (this.state.isChoosingWorkingDirectory || !this.smokeBridge.isAvailable()) {
      return;
    }

    this.setState({
      isChoosingWorkingDirectory: true,
    });

    try {
      const result = await this.smokeBridge.chooseWorkingDirectory(
        this.state.newSessionCwd.trim() || this.state.homeDirectory,
      );
      this.setState((previousState) => ({
        isChoosingWorkingDirectory: false,
        newSessionCwd: result.path?.trim() || previousState.newSessionCwd,
      }));
    } catch (error) {
      this.setState({
        isChoosingWorkingDirectory: false,
      });
      this.appendLog({
        provider: this.state.newSessionProvider,
        level: "error",
        message: error instanceof Error ? error.message : "Failed to choose a working directory.",
        timestamp: new Date().toISOString(),
      });
    }
  };

  private readonly handleCreateSession = async (): Promise<void> => {
    if (this.state.activeRequestId || this.state.isSending || this.state.isCreatingSession) {
      return;
    }
    const provider = this.state.newSessionProvider;
    const cwd = this.state.newSessionCwd.trim();
    if (cwd.length === 0) {
      return;
    }
    this.setState({
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

    this.setState({
      isCreatingSession: true,
    });

    try {
      const created = await this.smokeBridge.createChatSession(provider, cwd);
      this.setState((previousState) => ({
        isCreatingSession: false,
        isDraftingSession: false,
        isNewSessionDialogOpen: false,
        draftProvider: created.provider,
        newSessionProvider: created.provider,
        newSessionCwd: created.cwd,
        selectedProvider: created.provider,
        activeSessionId: created.sessionId,
        sessions: this.upsertSession(
          previousState.sessions,
          this.createSessionListItem(
            created.provider,
            created.sessionId,
            created.cwd,
            getSelectedModelValue(
              previousState.selectedModels[created.provider],
              previousState.providerModelCatalogs[created.provider],
            ),
            previousState.gitStatusByCwd[created.cwd],
          ),
        ),
      }));
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
      this.setState({
        isCreatingSession: false,
      });
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
      this.setState((previousState) => {
        const existingIndex = previousState.pendingApprovals.findIndex(
          (approval) => approval.approvalId === payload.approvalId,
        );
        const nextApprovals =
          existingIndex < 0
            ? [...previousState.pendingApprovals, payload]
            : previousState.pendingApprovals.map((approval, index) =>
                index === existingIndex ? payload : approval,
              );
        if (existingIndex < 0) {
          return {
            pendingApprovals: nextApprovals,
            chatMessages: payload.requestId
              ? upsertAssistantMessage(
                  previousState.chatMessages,
                  payload.requestId,
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
                )
              : previousState.chatMessages,
          };
        }

        return {
          pendingApprovals: nextApprovals,
          chatMessages: payload.requestId
            ? upsertAssistantMessage(
                previousState.chatMessages,
                payload.requestId,
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
              )
            : previousState.chatMessages,
        };
      });
      this.appendLog({
        provider: payload.provider,
        level: "update",
        message: `Approval requested to ${toToolActionLabel(approvalPresentation.title)}.`,
        timestamp: payload.timestamp,
      });
      return;
    }

    this.setState((previousState) => {
      const matchingApproval = previousState.pendingApprovals.find(
        (approval) => approval.approvalId === payload.approvalId,
      );
      const requestId = payload.requestId ?? matchingApproval?.requestId;
      const toolState: ChatToolCallState =
        payload.outcome.outcome === "cancelled" ? "output-denied" : "approval-responded";
      return {
        pendingApprovals: previousState.pendingApprovals.filter(
          (approval) => approval.approvalId !== payload.approvalId,
        ),
        respondingApprovalId:
          previousState.respondingApprovalId === payload.approvalId
            ? undefined
            : previousState.respondingApprovalId,
        chatMessages: requestId
          ? upsertAssistantMessage(
              previousState.chatMessages,
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
            )
          : previousState.chatMessages,
      };
    });
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
    this.setState((previousState) => ({
      transcriptEntries: [...previousState.transcriptEntries.slice(-199), payload],
    }));
  };

  private readonly handleChatStreamEvent = (
    payload: Extract<SmokeBridgeEvent, { type: "chatStreamEvent" }>["payload"],
  ): void => {
    if (payload.kind === "session_ready") {
      this.setState((previousState) => ({
        activeSessionId: payload.sessionId,
        isDraftingSession: false,
        draftProvider: payload.provider,
        selectedProvider: payload.provider,
        sessions: this.upsertSession(
          previousState.sessions,
          this.createSessionListItem(
            payload.provider,
            payload.sessionId,
            payload.cwd,
            getSelectedModelValue(
              previousState.selectedModels[payload.provider],
              previousState.providerModelCatalogs[payload.provider],
            ),
            previousState.gitStatusByCwd[payload.cwd],
          ),
        ),
      }));
      void this.hydrateGitStatus(payload.cwd, { force: true });
      return;
    }

    if (payload.kind === "agent_chunk") {
      this.setState((previousState) => {
        return {
          chatMessages: upsertAssistantMessage(
            previousState.chatMessages,
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
        };
      });
      return;
    }

    if (payload.kind === "reasoning_update") {
      this.setState((previousState) => ({
        chatMessages: upsertAssistantMessage(
          previousState.chatMessages,
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
      }));
      return;
    }

    if (payload.kind === "usage_update") {
      this.setState((previousState) => ({
        sessionUsageBySessionId: {
          ...previousState.sessionUsageBySessionId,
          [payload.sessionId]: {
            used: payload.used,
            size: payload.size,
            timestamp: payload.timestamp,
          },
        },
      }));
      return;
    }

    if (payload.kind === "tool_call" || payload.kind === "tool_call_update") {
      this.setState((previousState) => ({
        chatMessages: upsertAssistantMessage(
          previousState.chatMessages,
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
      }));
      return;
    }

    if (payload.kind === "agent_complete") {
      this.setState((previousState) => ({
        isCancellingRequest: false,
        activeRequestId:
          previousState.activeRequestId === payload.requestId
            ? undefined
            : previousState.activeRequestId,
        chatMessages: previousState.chatMessages.map((message) => {
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

    this.setState((previousState) => {
      const existingIndex = previousState.chatMessages.findIndex(
        (message) => message.requestId === payload.requestId && message.author === "assistant",
      );
      if (existingIndex < 0) {
        return {
          isCancellingRequest: false,
          activeRequestId:
            previousState.activeRequestId === payload.requestId
              ? undefined
              : previousState.activeRequestId,
          chatMessages: [
            ...previousState.chatMessages,
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

      const nextMessages = [...previousState.chatMessages];
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
          previousState.activeRequestId === payload.requestId
            ? undefined
            : previousState.activeRequestId,
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
      !this.state.activeRequestId ||
      !this.state.activeSessionId ||
      this.state.isCancellingRequest
    ) {
      return;
    }

    const provider = this.getActiveProvider();
    this.setState({
      isCancellingRequest: true,
    });

    try {
      const result = await this.smokeBridge.cancelChatMessage(
        provider,
        this.state.activeSessionId,
        this.state.activeRequestId,
        this.getSessionCwd(this.state.activeSessionId),
      );
      this.appendLog({
        provider: result.provider,
        level: "info",
        message: `Cancellation requested for ${result.requestId.slice(0, 8)}.`,
        timestamp: result.cancelledAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cancel request.";
      this.setState({
        isCancellingRequest: false,
      });
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
    const approval = this.state.pendingApprovals.find((entry) => entry.approvalId === approvalId);
    const provider = approval?.provider ?? this.getActiveProvider();
    this.setState({
      respondingApprovalId: approvalId,
    });

    try {
      await this.smokeBridge.respondToApproval(
        provider,
        approvalId,
        outcome,
        approval?.cwd ?? this.getSessionCwd(approval?.sessionId),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to answer approval request.";
      this.setState({
        respondingApprovalId: undefined,
      });
      this.appendLog({
        provider,
        level: "error",
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  private readonly handleRetryLastMessage = async (): Promise<void> => {
    if (this.state.isSending || this.state.activeRequestId || this.state.isCreatingSession) {
      return;
    }

    const lastUserMessage = this.getLastUserMessage(this.state.activeSessionId);
    if (!lastUserMessage) {
      return;
    }

    await this.handleSendMessage(lastUserMessage.text);
  };

  private readonly handleSendMessage = async (messageOverride?: string): Promise<void> => {
    if (this.state.activeRequestId || this.state.isSending) {
      return;
    }
    const messageText = (messageOverride ?? this.state.chatInput).trim();
    if (messageText.length === 0) {
      return;
    }
    if (!this.state.activeSessionId) {
      return;
    }
    const activeSession = this.getSessionById(this.state.activeSessionId);
    const selectedProvider = activeSession?.provider ?? this.state.selectedProvider;
    const selectedCatalog = this.state.providerModelCatalogs[selectedProvider];
    const selectedModelValue = getSelectedModelValue(
      this.state.selectedModels[selectedProvider],
      selectedCatalog,
    );
    const selectedModel = selectedModelValue.trim() || undefined;
    const shouldClearInput = messageOverride === undefined;
    const targetSessionId = activeSession?.id;
    const userMessageId = crypto.randomUUID();

    if (!this.smokeBridge.isAvailable()) {
      const timestamp = new Date().toISOString();
      this.setState((previousState) => ({
        chatMessages: [
          ...previousState.chatMessages,
          {
            id: crypto.randomUUID(),
            author: "system",
            provider: selectedProvider,
            text: "Electrobun bridge is unavailable. Launch the app with the Electrobun runtime.",
            timestamp,
            status: "error",
          },
        ],
      }));
      return;
    }

    const timestamp = new Date().toISOString();
    this.setState((previousState) => ({
      chatInput: shouldClearInput ? "" : previousState.chatInput,
      chatMessages: [
        ...previousState.chatMessages,
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
      this.setState((previousState) => {
        const hasStreamingMessage = previousState.chatMessages.some(
          (message) => message.requestId === result.requestId && message.author === "assistant",
        );
        return {
          activeRequestId: result.requestId,
          activeSessionId: result.sessionId,
          isDraftingSession: false,
          draftProvider: result.provider,
          selectedProvider: result.provider,
          isSending: false,
          sessions: this.upsertSession(
            previousState.sessions,
            this.createSessionListItem(
              result.provider,
              result.sessionId,
              result.cwd,
              result.model ??
                getSelectedModelValue(
                  previousState.selectedModels[result.provider],
                  previousState.providerModelCatalogs[result.provider],
                ),
              previousState.gitStatusByCwd[result.cwd],
            ),
          ),
          chatMessages: hasStreamingMessage
            ? previousState.chatMessages.map((message) =>
                message.id === userMessageId
                  ? {
                      ...message,
                      requestId: result.requestId,
                      sessionId: result.sessionId,
                    }
                  : message,
              )
            : [
                ...previousState.chatMessages.map((message) =>
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
      this.setState((previousState) => ({
        isSending: false,
        isCancellingRequest: false,
        chatMessages: [
          ...previousState.chatMessages,
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
    const entry: SmokeLogLine = {
      ...input,
      id: crypto.randomUUID(),
    };

    this.setState((previousState) => ({
      logs: [...previousState.logs.slice(-149), entry],
    }));
  }

  async getSnapshot(): Promise<AppTestSnapshot> {
    const activeSession = this.getSessionById(this.state.activeSessionId);
    const visibleMessages = this.state.activeSessionId
      ? this.state.chatMessages.filter(
          (message) => message.sessionId === this.state.activeSessionId,
        )
      : [];

    const sessions: AppTestSessionSnapshot[] = this.state.sessions.map((session) => ({
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
    const approvalSnapshots: AppTestApprovalSnapshot[] = this.state.pendingApprovals.map(
      (approval) => ({
        approvalId: approval.approvalId,
        provider: approval.provider,
        sessionId: approval.sessionId,
        requestId: approval.requestId,
        optionIds: approval.options.map((option) => option.optionId),
      }),
    );

    const visibleTranscriptEntries = this.state.activeSessionId
      ? this.state.transcriptEntries.filter(
          (entry) =>
            entry.sessionId === this.state.activeSessionId ||
            (!entry.sessionId &&
              entry.provider === (activeSession?.provider ?? this.state.selectedProvider)),
        )
      : this.state.transcriptEntries.filter(
          (entry) => entry.provider === this.state.selectedProvider,
        );

    return {
      ready: true,
      isSending: this.state.isSending,
      isCreatingSession: this.state.isCreatingSession,
      isCancellingRequest: this.state.isCancellingRequest,
      isNewSessionDialogOpen: this.state.isNewSessionDialogOpen,
      activeRequestId: this.state.activeRequestId,
      activeSessionId: this.state.activeSessionId,
      selectedProvider: this.state.selectedProvider,
      sessions,
      visibleMessages: messageSnapshots,
      pendingApprovals: approvalSnapshots,
      transcriptEntryCount: visibleTranscriptEntries.length,
      runtimeLogCount: this.state.logs.length,
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
        this.setState(
          this.createInitialState({
            homeDirectory: this.state.homeDirectory,
            newSessionCwd: this.state.homeDirectory ?? "",
            themePreference: this.state.themePreference,
            themeMode: this.state.themeMode,
            isRightSidebarOpen: this.state.isRightSidebarOpen,
          }),
          () => resolve(),
        );
      });
      return this.getSnapshot();
    }

    if (action.type === "createSession") {
      await new Promise<void>((resolve) => {
        this.setState(
          {
            isNewSessionDialogOpen: true,
            newSessionProvider: action.provider,
            newSessionCwd: action.cwd,
          },
          () => resolve(),
        );
      });
      await this.handleCreateSession();
      return this.getSnapshot();
    }

    if (action.type === "selectSession") {
      this.handleSelectSession(action.sessionId);
      return this.getSnapshot();
    }

    if (action.type === "typeComposer") {
      await new Promise<void>((resolve) => {
        this.setState(
          {
            chatInput: action.text,
          },
          () => resolve(),
        );
      });
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

    const approval = this.state.pendingApprovals.find(
      (entry) => entry.approvalId === action.approvalId,
    );
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
    const selectedProvider = this.state.selectedProvider;
    const draftProvider = this.state.draftProvider;
    const activeSession = this.getSessionById(this.state.activeSessionId);
    const activeProvider = activeSession?.provider ?? selectedProvider;
    const selectedCatalog = this.state.providerModelCatalogs[activeProvider];
    const selectedModelState = getProviderModelSelection(
      this.state.selectedModels[activeProvider],
      selectedCatalog,
    );
    const modelOptions = getProviderModelOptions(selectedCatalog);
    const modelHelperText = getProviderModelHelperText(selectedCatalog);
    const selectedProviderLabel = getSmokeProviderLabel(activeProvider);
    const draftProviderLabel = getSmokeProviderLabel(draftProvider);
    const hasActiveSession = Boolean(this.state.activeSessionId);
    const isBusy =
      Boolean(this.state.activeRequestId) ||
      this.state.isSending ||
      this.state.isCreatingSession ||
      this.state.isCancellingRequest;
    const canStopActiveRequest =
      Boolean(this.state.activeRequestId) &&
      Boolean(this.state.activeSessionId) &&
      !this.state.isCancellingRequest;
    const showStopAction = this.state.isSending || Boolean(this.state.activeRequestId);
    const lastUserMessage = this.getLastUserMessage(this.state.activeSessionId);
    const currentApproval = this.state.pendingApprovals[0];
    const activeUsage = this.state.activeSessionId
      ? this.state.sessionUsageBySessionId[this.state.activeSessionId]
      : undefined;
    const isRightSidebarOpen = this.state.isRightSidebarOpen;
    const visibleTranscriptEntries = this.state.activeSessionId
      ? this.state.transcriptEntries.filter(
          (entry) =>
            entry.sessionId === this.state.activeSessionId ||
            (!entry.sessionId && entry.provider === activeProvider),
        )
      : this.state.transcriptEntries.filter((entry) => entry.provider === draftProvider);
    const newestTranscriptEntriesFirst = visibleTranscriptEntries.slice().reverse();
    const newestLogsFirst = this.state.logs.slice().reverse();
    const visibleMessages = this.state.activeSessionId
      ? this.state.chatMessages.filter(
          (message) => message.sessionId === this.state.activeSessionId,
        )
      : [];
    const activeSessionCwd = activeSession?.cwd;
    const directoryEntries = activeSessionCwd
      ? (this.state.sessionDirectoryEntriesByCwd[activeSessionCwd] ?? [])
      : [];
    const directoryError = activeSessionCwd
      ? this.state.sessionDirectoryErrorsByCwd[activeSessionCwd]
      : undefined;
    const isDirectoryLoading = activeSessionCwd
      ? Boolean(this.state.sessionDirectoryLoadingByCwd[activeSessionCwd])
      : false;
    const activeGitStatus = activeSessionCwd
      ? this.state.gitStatusByCwd[activeSessionCwd]
      : undefined;
    const activeGitStatusError = activeSessionCwd
      ? this.state.gitStatusErrorsByCwd[activeSessionCwd]
      : undefined;
    const isActiveGitStatusLoading = activeSessionCwd
      ? Boolean(this.state.gitStatusLoadingByCwd[activeSessionCwd])
      : false;
    const newSessionTrimmedCwd = this.state.newSessionCwd.trim();
    const newSessionGitStatus = newSessionTrimmedCwd
      ? this.state.gitStatusByCwd[newSessionTrimmedCwd]
      : undefined;
    const newSessionGitStatusError = newSessionTrimmedCwd
      ? this.state.gitStatusErrorsByCwd[newSessionTrimmedCwd]
      : undefined;
    const isNewSessionGitStatusLoading = newSessionTrimmedCwd
      ? Boolean(this.state.gitStatusLoadingByCwd[newSessionTrimmedCwd])
      : false;
    const rightSidebarTabContent: Record<RightSidebarTabType, React.ReactNode> = {
      inspector: (
        <div className="flex min-h-0 flex-col gap-4">
          <InspectorPanel
            contextWindow={this.state.activeSessionId ? "live session" : "not started"}
            activeRequestId={this.state.activeRequestId}
            canRetry={Boolean(lastUserMessage) && !isBusy}
            canStop={canStopActiveRequest}
            isStopping={this.state.isCancellingRequest}
            isWorking={showStopAction}
            modelName={hasActiveSession ? selectedProviderLabel : draftProviderLabel}
            onRetry={() => {
              void this.handleRetryLastMessage();
            }}
            onStop={() => {
              void this.handleStopActiveRequest();
            }}
            pendingApprovalCount={this.state.pendingApprovals.length}
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
                value={this.state.themePreference}
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
              activeSessionId={this.state.activeSessionId}
              onCreateSession={this.handleOpenNewSessionDialog}
              onSelectSession={this.handleSelectSession}
              disabled={isBusy}
              sessions={this.state.sessions}
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
                    onChange={(markdown) => this.setState({ chatInput: markdown })}
                    onSubmit={() => void this.handleSendMessage()}
                    placeholder="Type a prompt. Use @ to mention files, / for commands. Press Enter to send."
                    value={this.state.chatInput}
                  />
                  <div className="mt-3 flex items-end gap-3">
                    <div className="flex-1">
                      <label className="mb-2 block text-xs font-medium text-muted-foreground">
                        Model
                      </label>
                      <Select
                        disabled={isBusy}
                        onValueChange={(value) =>
                          this.setState((previousState) => ({
                            selectedModels: {
                              ...previousState.selectedModels,
                              [activeProvider]: resolveProviderModelSelection(
                                value === DEFAULT_MODEL_VALUE || value == null ? "" : value,
                                selectedModelState.selectedThinkingLevelValue,
                                selectedCatalog,
                              ),
                            },
                          }))
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
                            this.setState((previousState) => ({
                              selectedModels: {
                                ...previousState.selectedModels,
                                [activeProvider]: resolveProviderModelSelection(
                                  selectedModelState.modelValue,
                                  value ?? selectedModelState.selectedThinkingLevelValue,
                                  selectedCatalog,
                                ),
                              },
                            }))
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
                        this.state.isCreatingSession ||
                        (showStopAction
                          ? !canStopActiveRequest
                          : this.state.chatInput.trim().length === 0)
                      }
                      label={
                        showStopAction
                          ? this.state.isCancellingRequest
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
          cwd={this.state.newSessionCwd}
          gitStatus={newSessionGitStatus}
          gitStatusError={newSessionGitStatusError}
          isCreating={this.state.isCreatingSession}
          isGitStatusLoading={isNewSessionGitStatusLoading}
          isChoosingWorkingDirectory={this.state.isChoosingWorkingDirectory}
          onRefreshGitStatus={async (cwd) => {
            await this.hydrateGitStatus(cwd, {
              force: true,
            });
          }}
          onChooseWorkingDirectory={() => {
            void this.handleChooseWorkingDirectory();
          }}
          onCwdChange={(cwd) => {
            this.setState({
              newSessionCwd: cwd,
            });
          }}
          onOpenChange={this.handleNewSessionDialogOpenChange}
          onProviderChange={(provider) => {
            this.setState({
              newSessionProvider: provider,
            });
          }}
          onSubmit={() => {
            void this.handleCreateSession();
          }}
          open={this.state.isNewSessionDialogOpen}
          provider={this.state.newSessionProvider}
          smokeBridge={this.smokeBridge}
        />
        <ApprovalDialog
          approval={currentApproval}
          isResponding={this.state.respondingApprovalId === currentApproval?.approvalId}
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
