import type {
  AgentTranscriptEventPayload,
  ApprovalEventPayload,
  ChatStreamEventPayload,
  GetGitDiffResult,
  GetGitStatusResult,
  NormalizedSessionMode,
  PlanReviewDecision,
  PlanReviewEventPayload,
  PlanReviewSource,
  ProviderModelCatalog,
  SessionDirectoryEntry,
  SmokeProvider,
} from "./AppRPC.ts";

export type AppTestChatAuthor = "user" | "assistant" | "system";
export type AppTestChatStatus = "streaming" | "complete" | "error";

export interface AppTestSessionSnapshot {
  id: string;
  provider: SmokeProvider;
  title: string;
  model: string;
  cwd: string;
}

export interface AppTestMessageSnapshot {
  author: AppTestChatAuthor;
  provider: SmokeProvider;
  requestId?: string;
  sessionId?: string;
  text: string;
  status?: AppTestChatStatus;
}

export interface AppTestApprovalSnapshot {
  approvalId: string;
  provider: SmokeProvider;
  sessionId: string;
  requestId?: string;
  optionIds: string[];
}

export interface AppTestGitPanelSnapshot {
  headerTexts: string[];
  diffViewModes: string[];
  tokenizedSegmentCount: number;
  readyHighlightCount: number;
  collapsedContextLabels: string[];
}

export interface AppTestSnapshot {
  ready: boolean;
  isSending: boolean;
  isCreatingSession: boolean;
  isCancellingRequest: boolean;
  isNewSessionDialogOpen: boolean;
  activeRequestId?: string;
  activeSessionId?: string;
  activeSessionMode?: NormalizedSessionMode;
  selectedProvider: SmokeProvider;
  sessions: AppTestSessionSnapshot[];
  visibleMessages: AppTestMessageSnapshot[];
  pendingApprovals: AppTestApprovalSnapshot[];
  pendingPlanReview?: {
    reviewId: string;
    sessionId: string;
    source: PlanReviewSource;
    canResumeGeneration: boolean;
  };
  transcriptEntryCount: number;
  runtimeLogCount: number;
  rightSidebarActiveTab?: string;
  rightSidebarOpenTabs: string[];
  gitHeaderSummaryText?: string;
  gitPanel?: AppTestGitPanelSnapshot;
}

export interface AppTestWaitForStateParams {
  timeoutMs?: number;
  pollIntervalMs?: number;
  activeSessionId?: string;
  hasActiveRequest?: boolean;
  sessionCount?: number;
  visibleMessageCount?: number;
  pendingApprovalCount?: number;
  lastMessageAuthor?: AppTestChatAuthor;
  lastMessageStatus?: AppTestChatStatus;
}

export type AppTestAction =
  | {
      type: "resetApp";
    }
  | {
      type: "createSession";
      provider: SmokeProvider;
      cwd: string;
    }
  | {
      type: "selectSession";
      sessionId: string;
    }
  | {
      type: "typeComposer";
      text: string;
    }
  | {
      type: "submitComposer";
    }
  | {
      type: "cancelActiveRequest";
    }
  | {
      type: "resolveApproval";
      approvalId: string;
      optionId: string;
    }
  | {
      type: "setSessionMode";
      mode: NormalizedSessionMode;
      sessionId?: string;
    }
  | {
      type: "respondToPlanReview";
      decision: PlanReviewDecision;
      feedback?: string;
    };

export type ReplayFixtureEventRecord =
  | {
      type: "chatStreamEvent";
      delayMs?: number;
      payload: ChatStreamEventPayload;
    }
  | {
      type: "approvalEvent";
      delayMs?: number;
      payload: ApprovalEventPayload;
    }
  | {
      type: "agentTranscriptEvent";
      delayMs?: number;
      payload: AgentTranscriptEventPayload;
    }
  | {
      type: "planReviewEvent";
      delayMs?: number;
      payload: PlanReviewEventPayload;
    };

export interface ReplayFixtureSession {
  sessionId: string;
  provider: SmokeProvider;
  cwd: string;
  title: string;
  model: string;
}

export interface ReplayFixtureEmitPhase {
  kind: "emit";
  startEventIndex: number;
  endEventIndex: number;
}

export interface ReplayFixtureAwaitApprovalPhase {
  kind: "awaitApproval";
  approvalId: string;
  expectedOptionId?: string;
}

export interface ReplayFixtureAwaitPlanReviewPhase {
  kind: "awaitPlanReview";
  reviewId: string;
  expectedDecision?: PlanReviewDecision;
}

export interface ReplayFixtureAwaitCancelPhase {
  kind: "awaitCancel";
  cancelledAt?: string;
}

export type ReplayFixturePhase =
  | ReplayFixtureEmitPhase
  | ReplayFixtureAwaitApprovalPhase
  | ReplayFixtureAwaitPlanReviewPhase
  | ReplayFixtureAwaitCancelPhase;

export interface ReplayFixtureSendMessageAction {
  actionId: string;
  type: "sendChatMessage";
  provider: SmokeProvider;
  sessionId: string;
  cwd: string;
  message: string;
  model?: string;
  result: {
    requestId: string;
    provider: SmokeProvider;
    sessionId: string;
    cwd: string;
    model?: string;
  };
  phases: ReplayFixturePhase[];
}

export interface ReplayFixtureCreateSessionAction {
  actionId: string;
  type: "createChatSession";
  provider: SmokeProvider;
  cwd: string;
  sessionId: string;
}

export type ReplayFixtureAction = ReplayFixtureCreateSessionAction | ReplayFixtureSendMessageAction;

export interface ReplayFixtureMetadata {
  schemaVersion: 1;
  fixtureName: string;
  description?: string;
  homeDirectory: string;
  sessions: ReplayFixtureSession[];
  providerModelCatalogs: Partial<Record<SmokeProvider, ProviderModelCatalog>>;
  directoryEntriesByCwd?: Record<string, SessionDirectoryEntry[]>;
  gitStatusesByCwd?: Record<string, GetGitStatusResult>;
  gitDiffsByCwd?: Record<string, GetGitDiffResult>;
  actions: ReplayFixtureAction[];
}
