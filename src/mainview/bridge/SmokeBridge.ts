import type {
  AgentTranscriptEventPayload,
  AppUpdateEventPayload,
  ApplyAppUpdateResult,
  ApprovalOutcome,
  ApprovalEventPayload,
  AvailableCommandsEventPayload,
  CheckForAppUpdatesResult,
  CancelChatMessageResult,
  GetProviderSessionConfigResult,
  GetGitBranchesResult,
  ChatStreamEventPayload,
  ChooseWorkingDirectoryResult,
  CreateChatSessionResult,
  GetAppSettingsResult,
  SetAppSettingsResult,
  GetStoredSessionRecordingResult,
  ListStoredSessionsResult,
  GetAvailableCommandsResult,
  GetGitDiffResult,
  GetGitFileDiffResult,
  GetGitStatusResult,
  GetHomeDirectoryResult,
  GetAppUpdateStateResult,
  GetUILayoutStateResult,
  ListDirectoryResult,
  GetProviderModelCatalogResult,
  PlanReviewDecision,
  PlanReviewEventPayload,
  RespondToApprovalResult,
  RespondToPlanReviewResult,
  SessionModeConfigEventPayload,
  SetUILayoutStateResult,
  RespondToUserInputResult,
  SmokeEventPayload,
  SmokeFinishedPayload,
  SmokeProvider,
  SetSessionModeResult,
  SwitchGitBranchResult,
  SendChatMessageResult,
  StartSmokeTestResult,
  UserInputEventPayload,
  UserInputOutcome,
} from "../../shared/AppRPC.ts";
import type { AppSettings } from "../../shared/appSettings.ts";
import type { PersistedUILayoutState } from "../../shared/uiLayoutState.ts";

export type SmokeBridgeEvent =
  | {
      type: "smokeEvent";
      payload: SmokeEventPayload;
    }
  | {
      type: "smokeFinished";
      payload: SmokeFinishedPayload;
    }
  | {
      type: "chatStreamEvent";
      payload: ChatStreamEventPayload;
    }
  | {
      type: "approvalEvent";
      payload: ApprovalEventPayload;
    }
  | {
      type: "userInputEvent";
      payload: UserInputEventPayload;
    }
  | {
      type: "agentTranscriptEvent";
      payload: AgentTranscriptEventPayload;
    }
  | {
      type: "availableCommandsEvent";
      payload: AvailableCommandsEventPayload;
    }
  | {
      type: "sessionModeConfigEvent";
      payload: SessionModeConfigEventPayload;
    }
  | {
      type: "planReviewEvent";
      payload: PlanReviewEventPayload;
    }
  | {
      type: "appUpdateEvent";
      payload: AppUpdateEventPayload;
    };

export interface SmokeBridge {
  isAvailable(): boolean;
  startSmokeTest(provider: SmokeProvider, prompt: string): Promise<StartSmokeTestResult>;
  sendChatMessage(
    provider: SmokeProvider,
    message: string,
    model?: string,
    sessionId?: string,
    cwd?: string,
  ): Promise<SendChatMessageResult>;
  cancelChatMessage(
    provider: SmokeProvider,
    sessionId?: string,
    requestId?: string,
    cwd?: string,
  ): Promise<CancelChatMessageResult>;
  createChatSession(
    provider: SmokeProvider,
    cwd?: string,
    mode?: "build" | "plan",
  ): Promise<CreateChatSessionResult>;
  listStoredSessions(): Promise<ListStoredSessionsResult>;
  getStoredSessionRecording(sessionId: string): Promise<GetStoredSessionRecordingResult>;
  getHomeDirectory(): Promise<GetHomeDirectoryResult>;
  getUILayoutState(): Promise<GetUILayoutStateResult>;
  setUILayoutState(state: PersistedUILayoutState): Promise<SetUILayoutStateResult>;
  getAppSettings(): Promise<GetAppSettingsResult>;
  setAppSettings(settings: AppSettings): Promise<SetAppSettingsResult>;
  chooseWorkingDirectory(startingFolder?: string): Promise<ChooseWorkingDirectoryResult>;
  listDirectory(cwd: string): Promise<ListDirectoryResult>;
  getGitStatus(cwd: string): Promise<GetGitStatusResult>;
  getGitBranches(cwd: string): Promise<GetGitBranchesResult>;
  getGitDiff(cwd: string): Promise<GetGitDiffResult>;
  getGitFileDiff(cwd: string, path: string, originalPath?: string): Promise<GetGitFileDiffResult>;
  switchGitBranch(cwd: string, branch: string): Promise<SwitchGitBranchResult>;
  getProviderModelCatalog(
    provider: SmokeProvider,
    cwd?: string,
  ): Promise<GetProviderModelCatalogResult>;
  getProviderSessionConfig(
    provider: SmokeProvider,
    sessionId?: string,
    cwd?: string,
  ): Promise<GetProviderSessionConfigResult>;
  getAppUpdateState(): Promise<GetAppUpdateStateResult>;
  checkForAppUpdates(): Promise<CheckForAppUpdatesResult>;
  applyAppUpdate(): Promise<ApplyAppUpdateResult>;
  getAvailableCommands(
    provider: SmokeProvider,
    sessionId?: string,
    cwd?: string,
  ): Promise<GetAvailableCommandsResult>;
  setSessionMode(
    provider: SmokeProvider,
    mode: "build" | "plan",
    sessionId?: string,
    cwd?: string,
  ): Promise<SetSessionModeResult>;
  respondToApproval(
    provider: SmokeProvider,
    approvalId: string,
    outcome: ApprovalOutcome,
    cwd?: string,
  ): Promise<RespondToApprovalResult>;
  respondToPlanReview(
    provider: SmokeProvider,
    reviewId: string,
    decision: PlanReviewDecision,
    sessionId?: string,
    cwd?: string,
  ): Promise<RespondToPlanReviewResult>;
  respondToUserInput(
    provider: SmokeProvider,
    inputId: string,
    outcome: UserInputOutcome,
    cwd?: string,
  ): Promise<RespondToUserInputResult>;
  subscribe(listener: (event: SmokeBridgeEvent) => void): () => void;
}

export class NoopSmokeBridge implements SmokeBridge {
  isAvailable(): boolean {
    return false;
  }

  async startSmokeTest(_provider: SmokeProvider, _prompt: string): Promise<StartSmokeTestResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async sendChatMessage(
    _provider: SmokeProvider,
    _message: string,
    _model?: string,
    _sessionId?: string,
    _cwd?: string,
  ): Promise<SendChatMessageResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async createChatSession(
    _provider: SmokeProvider,
    _cwd?: string,
    _mode?: "build" | "plan",
  ): Promise<CreateChatSessionResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async listStoredSessions(): Promise<ListStoredSessionsResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getStoredSessionRecording(_sessionId: string): Promise<GetStoredSessionRecordingResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getHomeDirectory(): Promise<GetHomeDirectoryResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getUILayoutState(): Promise<GetUILayoutStateResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getAppSettings(): Promise<GetAppSettingsResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async setAppSettings(_settings: AppSettings): Promise<SetAppSettingsResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async setUILayoutState(_state: PersistedUILayoutState): Promise<SetUILayoutStateResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async chooseWorkingDirectory(_startingFolder?: string): Promise<ChooseWorkingDirectoryResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async listDirectory(_cwd: string): Promise<ListDirectoryResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getGitStatus(_cwd: string): Promise<GetGitStatusResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getGitBranches(_cwd: string): Promise<GetGitBranchesResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getGitDiff(_cwd: string): Promise<GetGitDiffResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getGitFileDiff(
    _cwd: string,
    _path: string,
    _originalPath?: string,
  ): Promise<GetGitFileDiffResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async switchGitBranch(_cwd: string, _branch: string): Promise<SwitchGitBranchResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async cancelChatMessage(
    _provider: SmokeProvider,
    _sessionId?: string,
    _requestId?: string,
    _cwd?: string,
  ): Promise<CancelChatMessageResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getProviderModelCatalog(
    _provider: SmokeProvider,
    _cwd?: string,
  ): Promise<GetProviderModelCatalogResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getProviderSessionConfig(
    _provider: SmokeProvider,
    _sessionId?: string,
    _cwd?: string,
  ): Promise<GetProviderSessionConfigResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getAppUpdateState(): Promise<GetAppUpdateStateResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async checkForAppUpdates(): Promise<CheckForAppUpdatesResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async applyAppUpdate(): Promise<ApplyAppUpdateResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async respondToApproval(
    _provider: SmokeProvider,
    _approvalId: string,
    _outcome: ApprovalOutcome,
    _cwd?: string,
  ): Promise<RespondToApprovalResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async setSessionMode(
    _provider: SmokeProvider,
    _mode: "build" | "plan",
    _sessionId?: string,
    _cwd?: string,
  ): Promise<SetSessionModeResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async respondToPlanReview(
    _provider: SmokeProvider,
    _reviewId: string,
    _decision: PlanReviewDecision,
    _sessionId?: string,
    _cwd?: string,
  ): Promise<RespondToPlanReviewResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async respondToUserInput(
    _provider: SmokeProvider,
    _inputId: string,
    _outcome: UserInputOutcome,
    _cwd?: string,
  ): Promise<RespondToUserInputResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getAvailableCommands(
    _provider: SmokeProvider,
    _sessionId?: string,
    _cwd?: string,
  ): Promise<GetAvailableCommandsResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  subscribe(): () => void {
    return () => {};
  }
}
