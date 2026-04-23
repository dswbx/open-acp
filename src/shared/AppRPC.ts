import type { RPCSchema } from "electrobun/bun";
import type { ProviderModelCatalog, SmokeProvider } from "./providerModels.ts";
import type { AppTestAction, AppTestSnapshot, AppTestWaitForStateParams } from "./e2e.ts";
import type { PersistedUILayoutState } from "./uiLayoutState.ts";
export type SmokeEventLevel = "info" | "update" | "error";

export type { ProviderModelCatalog, ProviderModelOption, SmokeProvider } from "./providerModels.ts";

export interface StartSmokeTestParams {
  provider: SmokeProvider;
  prompt?: string;
  cwd?: string;
}

export interface StartSmokeTestResult {
  runId: string;
  provider: SmokeProvider;
  startedAt: string;
}

export interface SendChatMessageParams {
  provider: SmokeProvider;
  message: string;
  model?: string;
  sessionId?: string;
  cwd?: string;
}

export interface SendChatMessageResult {
  requestId: string;
  provider: SmokeProvider;
  sessionId: string;
  cwd: string;
  model?: string;
}

export interface CancelChatMessageParams {
  provider: SmokeProvider;
  requestId?: string;
  sessionId?: string;
  cwd?: string;
}

export interface CancelChatMessageResult {
  provider: SmokeProvider;
  requestId: string;
  sessionId: string;
  cwd: string;
  cancelledAt: string;
}

export interface CreateChatSessionParams {
  provider: SmokeProvider;
  cwd?: string;
}

export interface CreateChatSessionResult {
  provider: SmokeProvider;
  sessionId: string;
  cwd: string;
}

export interface GetHomeDirectoryResult {
  path: string;
}

export interface GetUILayoutStateResult {
  state: PersistedUILayoutState;
}

export interface SetUILayoutStateParams {
  state: PersistedUILayoutState;
}

export interface SetUILayoutStateResult {
  state: PersistedUILayoutState;
}

export interface ChooseWorkingDirectoryParams {
  startingFolder?: string;
}

export interface ChooseWorkingDirectoryResult {
  path?: string;
}

export interface ListDirectoryParams {
  cwd: string;
}

export interface SessionDirectoryEntry {
  name: string;
  path: string;
  kind: "directory" | "file" | "other";
}

export interface ListDirectoryResult {
  cwd: string;
  entries: SessionDirectoryEntry[];
}

export interface GetGitStatusParams {
  cwd: string;
}

export interface GetGitBranchesParams {
  cwd: string;
}

export interface GetGitDiffParams {
  cwd: string;
}

export interface GetGitFileDiffParams {
  cwd: string;
  path: string;
  originalPath?: string;
}

export interface SwitchGitBranchParams {
  cwd: string;
  branch: string;
}

export type GitFileStatusCode =
  | "unmodified"
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "updated-but-unmerged"
  | "untracked"
  | "type-changed";

export interface GitStatusFile {
  path: string;
  originalPath?: string;
  indexStatus: GitFileStatusCode;
  workingTreeStatus: GitFileStatusCode;
  summary: string;
}

export interface GitStatusSummary {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  copied: number;
  typeChanged: number;
}

export interface GetGitStatusResult {
  cwd: string;
  isGitRepository: boolean;
  repositoryRoot?: string;
  branch?: string;
  head?: string;
  detached?: boolean;
  summary: GitStatusSummary;
  files: GitStatusFile[];
}

export interface GitBranchEntry {
  name: string;
  isCurrent: boolean;
}

export interface GetGitBranchesResult {
  cwd: string;
  isGitRepository: boolean;
  repositoryRoot?: string;
  currentBranch?: string;
  detached?: boolean;
  branches: GitBranchEntry[];
}

export interface GetGitDiffResult {
  cwd: string;
  isGitRepository: boolean;
  repositoryRoot?: string;
  text: string;
  files: Array<{
    path: string;
    originalPath?: string;
    text: string;
  }>;
}

export interface GetGitFileDiffResult {
  cwd: string;
  path: string;
  originalPath?: string;
  text: string;
}

export interface SwitchGitBranchResult {
  cwd: string;
  previousBranch?: string;
  currentBranch: string;
}

export interface GetProviderModelCatalogParams {
  provider: SmokeProvider;
  cwd?: string;
}

export interface GetProviderModelCatalogResult {
  provider: SmokeProvider;
  catalog: ProviderModelCatalog;
}

export interface AvailableCommand {
  name: string;
  description?: string;
  inputHint?: string;
}

export interface GetAvailableCommandsParams {
  provider: SmokeProvider;
  sessionId?: string;
  cwd?: string;
}

export interface GetAvailableCommandsResult {
  provider: SmokeProvider;
  sessionId: string;
  commands: AvailableCommand[];
}

export interface AvailableCommandsEventPayload {
  provider: SmokeProvider;
  sessionId: string;
  cwd: string;
  commands: AvailableCommand[];
  timestamp: string;
}

export interface ApprovalOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
}

export interface ApprovalLocation {
  path: string;
  line?: number | null;
}

export type ApprovalOutcome =
  | {
      outcome: "cancelled";
    }
  | {
      outcome: "selected";
      optionId: string;
    };

export interface RespondToApprovalParams {
  provider: SmokeProvider;
  approvalId: string;
  outcome: ApprovalOutcome;
  cwd?: string;
}

export interface RespondToApprovalResult {
  provider: SmokeProvider;
  approvalId: string;
  sessionId: string;
  cwd: string;
  outcome: ApprovalOutcome;
  respondedAt: string;
}

export interface UserInputFieldOption {
  value: string;
  label: string;
  description?: string;
}

export interface UserInputField {
  id: string;
  header?: string;
  question: string;
  options: UserInputFieldOption[];
  allowOther?: boolean;
  secret?: boolean;
}

export type UserInputOutcome =
  | {
      outcome: "cancelled";
    }
  | {
      outcome: "submitted";
      answers: Array<{
        fieldId: string;
        value: string;
      }>;
    };

export interface RespondToUserInputParams {
  provider: SmokeProvider;
  inputId: string;
  outcome: UserInputOutcome;
  cwd?: string;
}

export interface RespondToUserInputResult {
  provider: SmokeProvider;
  inputId: string;
  sessionId: string;
  cwd: string;
  outcome: UserInputOutcome;
  respondedAt: string;
}

export interface SmokeEventPayload {
  runId: string;
  provider: SmokeProvider;
  level: SmokeEventLevel;
  message: string;
  timestamp: string;
}

export interface SmokeFinishedPayload {
  runId: string;
  provider: SmokeProvider;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface ChatUsageBreakdown {
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export type ChatStreamEventKind =
  | "session_ready"
  | "agent_chunk"
  | "agent_thought_chunk"
  | "agent_complete"
  | "error"
  | "usage_update"
  | "reasoning_update"
  | "tool_call"
  | "tool_call_update";

export type ChatToolCallState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

interface ChatStreamEventBase {
  requestId: string;
  provider: SmokeProvider;
  sessionId: string;
  cwd: string;
  timestamp: string;
}

export type ChatStreamEventPayload =
  | (ChatStreamEventBase & {
      kind: "session_ready";
    })
  | (ChatStreamEventBase & {
      kind: "agent_chunk";
      text?: string;
    })
  | (ChatStreamEventBase & {
      kind: "agent_thought_chunk";
      text?: string;
    })
  | (ChatStreamEventBase & {
      kind: "agent_complete";
      stopReason?: string;
    })
  | (ChatStreamEventBase & {
      kind: "error";
      text?: string;
    })
  | (ChatStreamEventBase & {
      kind: "usage_update";
      used: number;
      size: number;
    } & ChatUsageBreakdown)
  | (ChatStreamEventBase & {
      kind: "reasoning_update";
      eventId: string;
      updateType: string;
      summary: string;
      detail?: string;
    })
  | (ChatStreamEventBase & {
      kind: "tool_call" | "tool_call_update";
      toolCallId: string;
      toolTitle?: string;
      toolKind?: string;
      toolState: ChatToolCallState;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    });

export type ApprovalEventPayload =
  | {
      kind: "requested";
      approvalId: string;
      provider: SmokeProvider;
      sessionId: string;
      cwd: string;
      requestId?: string;
      toolCallId: string;
      toolKind?: string;
      rawInput?: string;
      locations: ApprovalLocation[];
      options: ApprovalOption[];
      timestamp: string;
    }
  | {
      kind: "resolved";
      approvalId: string;
      provider: SmokeProvider;
      sessionId: string;
      cwd: string;
      requestId?: string;
      toolCallId: string;
      outcome: ApprovalOutcome;
      timestamp: string;
    };

export type UserInputEventPayload =
  | {
      kind: "requested";
      inputId: string;
      provider: SmokeProvider;
      sessionId: string;
      cwd: string;
      requestId?: string;
      fields: UserInputField[];
      timestamp: string;
    }
  | {
      kind: "resolved";
      inputId: string;
      provider: SmokeProvider;
      sessionId: string;
      cwd: string;
      requestId?: string;
      outcome: UserInputOutcome;
      timestamp: string;
    };

export type AgentTranscriptDirection = "incoming" | "outgoing";
export type AgentTranscriptKind = "request" | "response" | "notification";

export interface AgentTranscriptEventPayload {
  entryId: string;
  provider: SmokeProvider;
  sessionId?: string;
  direction: AgentTranscriptDirection;
  kind: AgentTranscriptKind;
  method?: string;
  requestId?: string | number | null;
  summary: string;
  json: string;
  timestamp: string;
}

export type OrchestratorRPC = {
  bun: RPCSchema<{
    requests: {
      startSmokeTest: {
        params: StartSmokeTestParams;
        response: StartSmokeTestResult;
      };
      sendChatMessage: {
        params: SendChatMessageParams;
        response: SendChatMessageResult;
      };
      cancelChatMessage: {
        params: CancelChatMessageParams;
        response: CancelChatMessageResult;
      };
      createChatSession: {
        params: CreateChatSessionParams;
        response: CreateChatSessionResult;
      };
      getHomeDirectory: {
        params: Record<string, never>;
        response: GetHomeDirectoryResult;
      };
      getUILayoutState: {
        params: Record<string, never>;
        response: GetUILayoutStateResult;
      };
      setUILayoutState: {
        params: SetUILayoutStateParams;
        response: SetUILayoutStateResult;
      };
      chooseWorkingDirectory: {
        params: ChooseWorkingDirectoryParams;
        response: ChooseWorkingDirectoryResult;
      };
      listDirectory: {
        params: ListDirectoryParams;
        response: ListDirectoryResult;
      };
      getGitStatus: {
        params: GetGitStatusParams;
        response: GetGitStatusResult;
      };
      getGitBranches: {
        params: GetGitBranchesParams;
        response: GetGitBranchesResult;
      };
      getGitDiff: {
        params: GetGitDiffParams;
        response: GetGitDiffResult;
      };
      getGitFileDiff: {
        params: GetGitFileDiffParams;
        response: GetGitFileDiffResult;
      };
      switchGitBranch: {
        params: SwitchGitBranchParams;
        response: SwitchGitBranchResult;
      };
      getProviderModelCatalog: {
        params: GetProviderModelCatalogParams;
        response: GetProviderModelCatalogResult;
      };
      getAvailableCommands: {
        params: GetAvailableCommandsParams;
        response: GetAvailableCommandsResult;
      };
      respondToApproval: {
        params: RespondToApprovalParams;
        response: RespondToApprovalResult;
      };
      respondToUserInput: {
        params: RespondToUserInputParams;
        response: RespondToUserInputResult;
      };
    };
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: {
      getTestSnapshot: {
        params: Record<string, never>;
        response: AppTestSnapshot;
      };
      waitForTestState: {
        params: AppTestWaitForStateParams;
        response: AppTestSnapshot;
      };
      performTestAction: {
        params: AppTestAction;
        response: AppTestSnapshot;
      };
    };
    messages: {
      smokeEvent: SmokeEventPayload;
      smokeFinished: SmokeFinishedPayload;
      chatStreamEvent: ChatStreamEventPayload;
      approvalEvent: ApprovalEventPayload;
      userInputEvent: UserInputEventPayload;
      agentTranscriptEvent: AgentTranscriptEventPayload;
      availableCommandsEvent: AvailableCommandsEventPayload;
    };
  }>;
};
