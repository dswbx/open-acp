import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ArrowUp, ChevronDown, PanelRightClose, PanelRightOpen, Square } from "lucide-react";
import { InspectorPanel } from "../ui/components/InspectorPanel.tsx";
import { SessionListPanel } from "../ui/components/SessionListPanel.tsx";
import { getSmokeProviderLabel } from "../shared/providerModels.ts";
import { ChatSurface } from "./components/ChatSurface.tsx";
import { ResizableMainLayout } from "./components/ResizableMainLayout.tsx";
import { ChatComposer } from "./components/ChatComposer.tsx";
import { AppUpdateControl } from "./components/AppUpdateControl.tsx";
import { FilesPanel } from "./components/FilesPanel.tsx";
import { RightSidebarTabs, type RightSidebarTabType } from "./components/RightSidebarTabs.tsx";
import { NoopSmokeBridge, type SmokeBridge } from "./bridge/SmokeBridge.ts";
import { NewSessionDialog } from "./components/NewSessionDialog.tsx";
import {
  getProviderModelHelperText,
  getProviderModelSelection,
  getProviderModelOptions,
  resolveProviderModelSelection,
} from "./providerModelCatalogState.ts";
import { useThemeStore } from "./theme/themeStore.ts";
import { ApprovalDialog } from "./components/ApprovalDialog.tsx";
import { UserInputDialog } from "./components/UserInputDialog.tsx";
import { useUIStore } from "./state/uiStore.ts";
import { useDirectoryStore } from "./state/directoryStore.ts";
import { useProviderModelStore } from "./state/providerModelStore.ts";
import { useLoggingStore } from "./state/loggingStore.ts";
import { useApprovalStore } from "./state/approvalStore.ts";
import { useAppUpdateStore } from "./state/appUpdateStore.ts";
import { useChatStore } from "./state/chatStore.ts";
import { useSessionCreationStore } from "./state/sessionCreationStore.ts";
import { useSessionStore } from "./state/sessionStore.ts";
import { useRightSidebarStore } from "./state/rightSidebarStore.ts";
import { useUserInputStore } from "./state/userInputStore.ts";
import type { ChatMessage } from "./chat/types.ts";
import type {
  AppTestAction,
  AppTestApprovalSnapshot,
  AppTestGitPanelSnapshot,
  AppTestMessageSnapshot,
  AppTestSessionSnapshot,
  AppTestSnapshot,
  AppTestWaitForStateParams,
} from "../shared/e2e.ts";
import { registerAppTestDriver, unregisterAppTestDriver } from "./testing/appTestDriver.ts";
import {
  getLastUserMessage,
  getSessionById,
  handleChooseWorkingDirectory,
  handleCreateSession,
  handleNewSessionDialogOpenChange,
  handleOpenNewSessionDialog,
  handleRespondToApproval,
  handleRespondToUserInput,
  handleRetryLastMessage,
  handleSelectSession,
  handleSendMessage,
  handleSmokeBridgeEvent,
  handleStopActiveRequest,
  hydrateAppUpdateState,
  hydrateHomeDirectory,
  hydrateSessionDirectory,
  reconcileActiveSessionSidebarState,
  resetReplayAppState,
} from "./app/appHandlers.ts";
import { ContextComposerControl, useContextStore } from "./features/context/index.ts";
import {
  GitHeaderSummary,
  GitPanel,
  hydrateGitStatus,
  reconcileGitTabForActiveSession,
  useGitStore,
} from "./features/git/index.ts";
import { hydrateRecordedSessionFromLocation as restoreRecordedSessionFromLocation } from "./app/sessionRecordingRestore.ts";
import { ModeToggle } from "./components/ThemeToggler.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipInline } from "@/components/ui/tooltip";
import { getCwdTopLevelItem } from "./utils/strings.ts";

interface AppProps {
  smokeBridge?: SmokeBridge;
}

const DEFAULT_MODEL_VALUE = "__default_model__";

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

function getGitPanelSnapshot(): AppTestGitPanelSnapshot | undefined {
  const panel = document.querySelector<HTMLElement>("[data-testid='git-panel']");
  if (!panel) {
    return undefined;
  }

  return {
    headerTexts: Array.from(panel.querySelectorAll<HTMLElement>("[data-testid='git-file-header']"))
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((text) => text.length > 0),
    diffViewModes: Array.from(panel.querySelectorAll<HTMLElement>("[data-git-diff-view]")).map(
      (element) => element.dataset.gitDiffView ?? "",
    ),
    tokenizedSegmentCount: panel.querySelectorAll("[data-git-tokenized='true']").length,
    readyHighlightCount: panel.querySelectorAll("[data-git-highlight-state='ready']").length,
    collapsedContextLabels: Array.from(
      panel.querySelectorAll<HTMLElement>("[data-git-collapsed-context]"),
    ).map((element) => element.dataset.gitCollapsedContext ?? ""),
  };
}

function getGitHeaderSummaryText(): string | undefined {
  return (
    document
      .querySelector<HTMLElement>("[data-testid='git-header-summary']")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || undefined
  );
}

function getVisibleMessageText(message: ChatMessage): string {
  if (message.author !== "assistant") {
    return message.text;
  }

  const blockText = (message.blocks ?? [])
    .flatMap((block) => (block.kind === "text" ? [block.text] : []))
    .join("");
  return `${blockText}${message.text}`.trim();
}

function getSnapshot(): AppTestSnapshot {
  const activeSessionId = useSessionStore.getState().activeSessionId;
  const activeSession = getSessionById(activeSessionId);
  const visibleMessages = activeSessionId
    ? useChatStore
        .getState()
        .chatMessages.filter((message) => message.sessionId === activeSessionId)
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
    text: getVisibleMessageText(message),
    status: message.status,
  }));
  const visibleToolCalls = visibleMessages.flatMap((message) =>
    (message.blocks ?? [])
      .filter((block) => block.kind === "tool")
      .map((block) => ({
        toolCallId: block.tool.toolCallId,
        kind: block.tool.kind,
        state: block.tool.state,
        errorText: block.tool.errorText,
      })),
  );
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
  const visibleTranscriptEntries = activeSessionId
    ? loggingState.transcriptEntries.filter(
        (entry) =>
          entry.sessionId === activeSessionId ||
          (!entry.sessionId &&
            entry.provider ===
              (activeSession?.provider ?? useSessionStore.getState().selectedProvider)),
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
    activeSessionId,
    selectedProvider: useSessionStore.getState().selectedProvider,
    sessions,
    visibleMessages: messageSnapshots,
    pendingApprovals: approvalSnapshots,
    visibleToolCalls,
    activeSessionUsage: activeSessionId
      ? useContextStore.getState().usageBySessionId[activeSessionId]
      : undefined,
    visibleTranscriptJsons: visibleTranscriptEntries.map((entry) => entry.json),
    transcriptEntryCount: visibleTranscriptEntries.length,
    runtimeLogCount: loggingState.logs.length,
    rightSidebarActiveTab: useRightSidebarStore.getState().activeTab,
    rightSidebarOpenTabs: [...useRightSidebarStore.getState().openTabs],
    gitHeaderSummaryText: getGitHeaderSummaryText(),
    gitPanel: getGitPanelSnapshot(),
  };
}

async function waitForState(params: AppTestWaitForStateParams): Promise<AppTestSnapshot> {
  const timeoutMs = params.timeoutMs ?? 5000;
  const pollIntervalMs = params.pollIntervalMs ?? 25;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const snapshot = getSnapshot();
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

function sendWindowMoveMessage(messageId: "startWindowMove" | "stopWindowMove"): void {
  const electrobunWindow = window as Window & {
    __electrobunInternalBridge?: { postMessage: (message: string) => void };
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
}

export function App(props: AppProps): React.ReactElement {
  const bridgeRef = useRef<SmokeBridge>(props.smokeBridge ?? new NoopSmokeBridge());
  const bridge = bridgeRef.current;
  const [, forceUpdateCounter] = useState(0);
  const forceUpdate = useCallback(() => forceUpdateCounter((value) => value + 1), []);

  const filesAutoOpenedRef = useRef<Set<string>>(new Set());
  const gitAutoOpenedRef = useRef<Set<string>>(new Set());
  const gitPreviewTimeoutRef = useRef<number | undefined>(undefined);

  const clearNewSessionGitStatusHydration = useCallback(() => {
    if (gitPreviewTimeoutRef.current !== undefined) {
      window.clearTimeout(gitPreviewTimeoutRef.current);
      gitPreviewTimeoutRef.current = undefined;
    }
  }, []);

  const scheduleNewSessionGitStatusHydration = useCallback(() => {
    clearNewSessionGitStatusHydration();
    gitPreviewTimeoutRef.current = window.setTimeout(() => {
      gitPreviewTimeoutRef.current = undefined;
      void hydrateGitStatus(bridge, useSessionCreationStore.getState().newSessionCwd);
    }, 250);
  }, [bridge, clearNewSessionGitStatusHydration]);

  const handleWindowDragEnd = useCallback(() => {
    sendWindowMoveMessage("stopWindowMove");
  }, []);

  useEffect(() => {
    const driver = {
      getSnapshot: async () => getSnapshot(),
      waitForState,
      performAction: async (action: AppTestAction): Promise<AppTestSnapshot> => {
        if (action.type === "resetApp") {
          resetReplayAppState();
          filesAutoOpenedRef.current.clear();
          gitAutoOpenedRef.current.clear();
          return getSnapshot();
        }
        if (action.type === "createSession") {
          useSessionCreationStore.setState({
            isNewSessionDialogOpen: true,
            newSessionProvider: action.provider,
            newSessionCwd: action.cwd,
          });
          await handleCreateSession(bridge);
          return getSnapshot();
        }
        if (action.type === "selectSession") {
          handleSelectSession(bridge, action.sessionId);
          return getSnapshot();
        }
        if (action.type === "typeComposer") {
          useChatStore.getState().setChatInput(action.text);
          return getSnapshot();
        }
        if (action.type === "submitComposer") {
          await handleSendMessage(bridge);
          return getSnapshot();
        }
        if (action.type === "cancelActiveRequest") {
          await handleStopActiveRequest(bridge);
          return getSnapshot();
        }
        const approval = useApprovalStore
          .getState()
          .pendingApprovals.find((entry) => entry.approvalId === action.approvalId);
        if (!approval) {
          throw new Error(`Unknown approval request: ${action.approvalId}`);
        }
        await handleRespondToApproval(bridge, action.approvalId, {
          outcome: "selected",
          optionId: action.optionId,
        });
        return getSnapshot();
      },
    };
    registerAppTestDriver(driver);
    window.addEventListener("mouseup", handleWindowDragEnd);

    const unsubscribeBridge = bridge.subscribe((event) => {
      handleSmokeBridgeEvent(bridge, event);
    });
    const unsubscribeTheme = useThemeStore.subscribe(forceUpdate);
    const unsubscribeDirectory = useDirectoryStore.subscribe(forceUpdate);
    const unsubscribeGit = useGitStore.subscribe(() => {
      forceUpdate();
      reconcileGitTabForActiveSession(gitAutoOpenedRef.current);
    });
    const unsubscribeProviderModel = useProviderModelStore.subscribe(forceUpdate);
    const unsubscribeLogging = useLoggingStore.subscribe(forceUpdate);
    const unsubscribeApproval = useApprovalStore.subscribe(forceUpdate);
    const unsubscribeAppUpdate = useAppUpdateStore.subscribe(forceUpdate);
    const unsubscribeChat = useChatStore.subscribe(forceUpdate);
    const unsubscribeUI = useUIStore.subscribe(forceUpdate);
    const unsubscribeRightSidebar = useRightSidebarStore.subscribe(forceUpdate);

    const unsubscribeSessionCreation = useSessionCreationStore.subscribe((next, prev) => {
      forceUpdate();
      if (next.isNewSessionDialogOpen) {
        const dialogJustOpened = !prev.isNewSessionDialogOpen;
        const cwdChanged = prev.newSessionCwd !== next.newSessionCwd;
        if (dialogJustOpened || cwdChanged) {
          scheduleNewSessionGitStatusHydration();
        }
      } else if (prev.isNewSessionDialogOpen) {
        clearNewSessionGitStatusHydration();
      }
    });

    const unsubscribeSession = useSessionStore.subscribe((next, prev) => {
      forceUpdate();
      const previousActiveCwd =
        prev.sessions.find((session) => session.id === prev.activeSessionId)?.cwd ?? "";
      reconcileActiveSessionSidebarState({
        bridge,
        previousActiveSessionId: prev.activeSessionId,
        previousActiveCwd,
        filesAutoOpenedSessions: filesAutoOpenedRef.current,
        gitAutoOpenedSessions: gitAutoOpenedRef.current,
      });
    });

    void hydrateHomeDirectory(bridge);
    void hydrateAppUpdateState(bridge);
    void restoreRecordedSessionFromLocation(bridge);

    return () => {
      unregisterAppTestDriver(driver);
      window.removeEventListener("mouseup", handleWindowDragEnd);
      unsubscribeBridge();
      unsubscribeTheme();
      unsubscribeDirectory();
      unsubscribeGit();
      unsubscribeProviderModel();
      unsubscribeLogging();
      unsubscribeApproval();
      unsubscribeAppUpdate();
      unsubscribeChat();
      unsubscribeUI();
      unsubscribeRightSidebar();
      unsubscribeSessionCreation();
      unsubscribeSession();
      clearNewSessionGitStatusHydration();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenRightSidebarTab = useCallback(
    (tab: RightSidebarTabType): void => {
      useRightSidebarStore.getState().openTab(tab);
      const activeCwd = getSessionById(useSessionStore.getState().activeSessionId)?.cwd;
      if (tab === "files") {
        void hydrateSessionDirectory(bridge, activeCwd);
      }
      if (tab === "git") {
        void hydrateGitStatus(bridge, activeCwd, { force: true });
      }
    },
    [bridge],
  );

  const handleActiveRightSidebarTabChange = useCallback(
    (tab: RightSidebarTabType): void => {
      useRightSidebarStore.getState().setActiveTab(tab);
      const activeCwd = getSessionById(useSessionStore.getState().activeSessionId)?.cwd;
      if (tab === "files") {
        void hydrateSessionDirectory(bridge, activeCwd);
      }
      if (tab === "git") {
        void hydrateGitStatus(bridge, activeCwd, { force: true });
      }
    },
    [bridge],
  );

  const handleCloseRightSidebarTab = useCallback((tab: RightSidebarTabType): void => {
    useRightSidebarStore.getState().closeTab(tab);
  }, []);

  const handleHeaderMouseDown = useCallback((event: React.MouseEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    sendWindowMoveMessage("startWindowMove");
  }, []);

  const handleToggleRightSidebar = useCallback((): void => {
    useUIStore.getState().toggleRightSidebar();
  }, []);

  const sessionState = useSessionStore.getState();
  const { selectedProvider, draftProvider, activeSessionId } = sessionState;
  const activeSession = getSessionById(activeSessionId);
  const activeProvider = activeSession?.provider ?? selectedProvider;
  const providerModelState = useProviderModelStore.getState();
  const selectedCatalog = providerModelState.catalogs[activeProvider];
  const selectedModelState = getProviderModelSelection(
    providerModelState.selected[activeProvider],
    selectedCatalog,
  );
  const modelOptions = getProviderModelOptions(selectedCatalog);
  const selectedModelOption =
    selectedModelState.resolvedModelId.length > 0
      ? selectedCatalog.models.find((model) => model.id === selectedModelState.resolvedModelId)
      : undefined;
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
  const lastUserMessage = getLastUserMessage(activeSessionId);
  const approvalState = useApprovalStore.getState();
  const appUpdateState = useAppUpdateStore.getState().state;
  const currentApproval = approvalState.pendingApprovals[0];
  const userInputState = useUserInputStore.getState();
  const currentUserInput = userInputState.pendingInputs[0];
  const loggingState = useLoggingStore.getState();
  const contextState = useContextStore.getState();
  const activeUsage = activeSessionId ? contextState.usageBySessionId[activeSessionId] : undefined;
  const isRightSidebarOpen = useUIStore.getState().isRightSidebarOpen;
  const sidebarState = useRightSidebarStore.getState();
  const visibleTranscriptEntries = activeSessionId
    ? loggingState.transcriptEntries.filter(
        (entry) =>
          entry.sessionId === activeSessionId ||
          (!entry.sessionId && entry.provider === activeProvider),
      )
    : loggingState.transcriptEntries.filter((entry) => entry.provider === draftProvider);
  const newestTranscriptEntriesFirst = visibleTranscriptEntries.slice().reverse();
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
  const activeGitDiffTotals = activeSessionCwd
    ? gitStoreState.diffTotalsByCwd[activeSessionCwd]
    : undefined;
  const activeGitDiffTotalsError = activeSessionCwd
    ? gitStoreState.diffTotalsErrorsByCwd[activeSessionCwd]
    : undefined;
  const isActiveGitDiffTotalsLoading = activeSessionCwd
    ? Boolean(gitStoreState.diffTotalsLoadingByCwd[activeSessionCwd])
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
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <InspectorPanel
          contextWindow={activeSessionId ? "live session" : "not started"}
          activeRequestId={useChatStore.getState().activeRequestId}
          canRetry={Boolean(lastUserMessage) && !isBusy}
          canStop={canStopActiveRequest}
          isStopping={useChatStore.getState().isCancellingRequest}
          isWorking={showStopAction}
          modelName={hasActiveSession ? selectedProviderLabel : draftProviderLabel}
          onRetry={() => {
            void handleRetryLastMessage(bridge);
          }}
          onStop={() => {
            void handleStopActiveRequest(bridge);
          }}
          pendingApprovalCount={approvalState.pendingApprovals.length}
          transcriptEntries={newestTranscriptEntriesFirst}
        />
      </div>
    ),
    files: (
      <FilesPanel
        cwd={activeSessionCwd}
        entries={directoryEntries}
        error={directoryError}
        isLoading={isDirectoryLoading}
        onRefresh={() => {
          void hydrateSessionDirectory(bridge, activeSessionCwd);
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
          await hydrateGitStatus(bridge, cwd, { force: true });
        }}
        smokeBridge={bridge}
      />
    ),
  };

  return (
    <main
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground"
      style={{ minWidth: 800, minHeight: 600 }}
    >
      <ResizableMainLayout
        isRightSidebarOpen={isRightSidebarOpen}
        left={
          <SessionListPanel
            activeSessionId={activeSessionId}
            onCreateSession={handleOpenNewSessionDialog}
            onSelectSession={(sessionId) => handleSelectSession(bridge, sessionId)}
            /* disabled={isBusy} */
            sessions={useSessionStore.getState().sessions}
          />
        }
        header={
          <header
            className="pl-4 py-2 px-2 flex flex-none items-center justify-between gap-4 backdrop-blur electrobun-webkit-app-region-drag border-b border-border"
            onMouseDown={handleHeaderMouseDown}
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          >
            <div className="flex items-center gap-2">
              <h2 className="leading-none">Chat</h2>
              {activeSession?.cwd ? (
                <GitHeaderSummary
                  cwd={activeSession.cwd}
                  diffTotals={activeGitDiffTotals}
                  diffTotalsError={activeGitDiffTotalsError}
                  gitStatus={activeGitStatus}
                  gitStatusError={activeGitStatusError}
                  isGitDiffTotalsLoading={isActiveGitDiffTotalsLoading}
                  isGitStatusLoading={isActiveGitStatusLoading}
                  onBranchSwitched={async (cwd) => {
                    await hydrateGitStatus(bridge, cwd, { force: true });
                  }}
                  smokeBridge={bridge}
                />
              ) : null}
              {activeSession?.cwd ? (
                <span className="text-sm opacity-70 leading-none">
                  <TooltipInline content={activeSession?.cwd}>
                    {getCwdTopLevelItem(activeSession?.cwd)}
                  </TooltipInline>
                </span>
              ) : null}
            </div>
            <div
              className="electrobun-webkit-app-region-no-drag flex items-center gap-2"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <AppUpdateControl
                  state={appUpdateState}
                  onApply={() => {
                    void bridge.applyAppUpdate();
                  }}
                  onCheck={() => {
                    void bridge.checkForAppUpdates();
                  }}
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ModeToggle />
              </label>
              <TooltipInline content="Toggle right sidebar">
                <Button
                  aria-label={isRightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"}
                  onClick={handleToggleRightSidebar}
                  size="icon"
                  title={isRightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"}
                  variant="outline"
                >
                  {isRightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
                </Button>
              </TooltipInline>
            </div>
          </header>
        }
        center={
          <section className="relative flex h-full min-h-0 flex-col overflow-hidden">
            {!hasActiveSession ? (
              <div className="mx-auto mt-2 flex min-h-0 w-full max-w-3xl flex-1 items-center justify-center rounded-md p-6 text-center text-sm text-muted-foreground">
                Create or select a session to start chatting.
              </div>
            ) : (
              <>
                <ChatSurface
                  contentClassName="pb-[16rem]"
                  messages={visibleMessages}
                  scrollButtonClassName="bottom-40"
                />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
                  <div className="pointer-events-auto mx-auto w-full max-w-3xl relative pb-4">
                    <div className="absolute bottom-0 left-0 right-0 h-3/4 bg-linear-to-t from-background via-background to-transparent z-0" />
                    <div className="rounded-3xl bg-card mx-4 relative z-1">
                      <ChatComposer
                        bridge={bridge}
                        cwd={activeSession?.cwd}
                        availableCommands={
                          activeSession
                            ? sidebarState.availableCommandsBySession[activeSession.id]
                            : undefined
                        }
                        disabled={isBusy}
                        onChange={(markdown) => useChatStore.getState().setChatInput(markdown)}
                        onSubmit={() => void handleSendMessage(bridge)}
                        placeholder="Type a prompt. Use @ to mention files, / for commands. Press Enter to send."
                        value={useChatStore.getState().chatInput}
                      />
                      <div className="mt-3 flex flex-row items-end justify-between gap-3 px-3 pb-3">
                        <div className="min-w-0">
                          <ContextComposerControl
                            fallbackMaxTokens={selectedModelOption?.contextWindowTokens}
                            modelId={selectedModelState.resolvedModelId || undefined}
                            modelLabel={selectedModelOption?.title}
                            usage={activeUsage}
                          />
                        </div>
                        <div className="flex flex-row gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger>
                              <Button
                                aria-label="Model"
                                variant="ghost"
                                className="!translate-y-0 opacity-70 rounded-full pl-4"
                                disabled={isBusy}
                              >
                                {selectedModelState.modelValue || "Default"}
                                <ChevronDown />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-auto">
                              <DropdownMenuGroup>
                                <DropdownMenuLabel>Model</DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                  value={selectedModelState.modelValue || DEFAULT_MODEL_VALUE}
                                  onValueChange={(value) =>
                                    useProviderModelStore
                                      .getState()
                                      .setSelectedModel(
                                        activeProvider,
                                        resolveProviderModelSelection(
                                          value === DEFAULT_MODEL_VALUE || value == null
                                            ? ""
                                            : value,
                                          selectedModelState.selectedThinkingLevelValue,
                                          selectedCatalog,
                                        ),
                                      )
                                  }
                                >
                                  <DropdownMenuRadioItem value={DEFAULT_MODEL_VALUE}>
                                    Default model
                                  </DropdownMenuRadioItem>
                                  {modelOptions.map((modelOption) => (
                                    <DropdownMenuRadioItem
                                      key={modelOption.id}
                                      value={modelOption.id}
                                    >
                                      {modelOption.title ?? modelOption.id}
                                    </DropdownMenuRadioItem>
                                  ))}
                                </DropdownMenuRadioGroup>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {selectedModelState.thinkingLevelOptions.length > 0 ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger>
                                <Button
                                  aria-label="Thinking level"
                                  variant="ghost"
                                  className="!translate-y-0 opacity-70 rounded-full pl-4"
                                  size="lg"
                                  disabled={isBusy}
                                >
                                  {selectedModelState.selectedThinkingLevelValue || "Default"}
                                  <ChevronDown />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-auto">
                                <DropdownMenuGroup>
                                  <DropdownMenuLabel>Reasoning</DropdownMenuLabel>
                                  <DropdownMenuRadioGroup
                                    value={
                                      selectedModelState.selectedThinkingLevelValue ||
                                      DEFAULT_MODEL_VALUE
                                    }
                                    onValueChange={(value) =>
                                      useProviderModelStore
                                        .getState()
                                        .setSelectedModel(
                                          activeProvider,
                                          resolveProviderModelSelection(
                                            selectedModelState.modelValue,
                                            value === DEFAULT_MODEL_VALUE || value == null
                                              ? ""
                                              : value,
                                            selectedCatalog,
                                          ),
                                        )
                                    }
                                  >
                                    {selectedModelState.thinkingLevelOptions.map((level) => (
                                      <DropdownMenuRadioItem key={level.id} value={level.id}>
                                        {level.title}
                                      </DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}

                          <Button
                            variant="default"
                            size="icon-lg"
                            aria-label={showStopAction ? "Stop" : "Send"}
                            disabled={
                              useSessionCreationStore.getState().isCreatingSession ||
                              (showStopAction
                                ? !canStopActiveRequest
                                : useChatStore.getState().chatInput.trim().length === 0)
                            }
                            className="rounded-full"
                            onClick={() => {
                              if (showStopAction) {
                                void handleStopActiveRequest(bridge);
                                return;
                              }
                              void handleSendMessage(bridge);
                            }}
                          >
                            {canStopActiveRequest ? <Square /> : <ArrowUp />}
                            <span className="sr-only">{showStopAction ? "Stop" : "Send"}</span>
                          </Button>
                        </div>
                      </div>
                      {modelHelperText ? (
                        <p className="mt-2 text-xs text-muted-foreground">{modelHelperText}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        }
        right={
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <RightSidebarTabs
              activeTab={sidebarState.activeTab}
              onActiveTabChange={handleActiveRightSidebarTabChange}
              onCloseTab={handleCloseRightSidebarTab}
              onOpenTab={handleOpenRightSidebarTab}
              openTabs={sidebarState.openTabs}
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
          await hydrateGitStatus(bridge, cwd, { force: true });
        }}
        onChooseWorkingDirectory={() => {
          void handleChooseWorkingDirectory(bridge);
        }}
        onCwdChange={(cwd) => {
          useSessionCreationStore.getState().setNewSessionCwd(cwd);
        }}
        onOpenChange={handleNewSessionDialogOpenChange}
        onProviderChange={(provider) => {
          useSessionCreationStore.getState().setNewSessionProvider(provider);
        }}
        onSubmit={() => {
          void handleCreateSession(bridge);
        }}
        open={useSessionCreationStore.getState().isNewSessionDialogOpen}
        provider={useSessionCreationStore.getState().newSessionProvider}
        smokeBridge={bridge}
      />
      <ApprovalDialog
        approval={currentApproval}
        isResponding={approvalState.respondingApprovalId === currentApproval?.approvalId}
        onSelectOption={(optionId) => {
          if (!currentApproval) return;
          void handleRespondToApproval(bridge, currentApproval.approvalId, {
            outcome: "selected",
            optionId,
          });
        }}
      />
      <UserInputDialog
        input={currentUserInput}
        isResponding={userInputState.respondingInputId === currentUserInput?.inputId}
        onCancel={() => {
          if (!currentUserInput) return;
          void handleRespondToUserInput(bridge, currentUserInput.inputId, {
            outcome: "cancelled",
          });
        }}
        onSubmit={(outcome) => {
          if (!currentUserInput) return;
          void handleRespondToUserInput(bridge, currentUserInput.inputId, outcome);
        }}
      />
    </main>
  );
}
