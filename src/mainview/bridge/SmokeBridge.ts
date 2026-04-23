import type {
  AgentTranscriptEventPayload,
  ApprovalOutcome,
  ApprovalEventPayload,
  AvailableCommandsEventPayload,
  CancelChatMessageResult,
  GetProviderSessionConfigResult,
  GetGitBranchesResult,
  ChatStreamEventPayload,
  ChooseWorkingDirectoryResult,
  CreateChatSessionResult,
  GetAvailableCommandsResult,
  GetGitDiffResult,
  GetGitFileDiffResult,
  GetGitStatusResult,
  GetHomeDirectoryResult,
  ListDirectoryResult,
  GetProviderModelCatalogResult,
  PlanReviewDecision,
  PlanReviewEventPayload,
  RespondToApprovalResult,
  RespondToPlanReviewResult,
  SessionModeConfigEventPayload,
  SmokeEventPayload,
  SmokeFinishedPayload,
  SmokeProvider,
  SetSessionModeResult,
  SwitchGitBranchResult,
  SendChatMessageResult,
  StartSmokeTestResult,
} from "../../shared/AppRPC.ts";

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
  getHomeDirectory(): Promise<GetHomeDirectoryResult>;
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

  async getHomeDirectory(): Promise<GetHomeDirectoryResult> {
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
