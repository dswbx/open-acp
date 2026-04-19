import type {
   AgentTranscriptEventPayload,
   ApprovalOutcome,
   ApprovalEventPayload,
   CancelChatMessageResult,
   GetGitBranchesResult,
   ChatStreamEventPayload,
   ChooseWorkingDirectoryResult,
   CreateChatSessionResult,
   GetGitDiffResult,
   GetGitFileDiffResult,
   GetGitStatusResult,
   GetHomeDirectoryResult,
   ListDirectoryResult,
   GetProviderModelCatalogResult,
   RespondToApprovalResult,
   SmokeEventPayload,
   SmokeFinishedPayload,
   SmokeProvider,
   SwitchGitBranchResult,
  SendChatMessageResult,
  StartSmokeTestResult
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
    };

export interface SmokeBridge {
  isAvailable(): boolean;
  startSmokeTest(
    provider: SmokeProvider,
    prompt: string
  ): Promise<StartSmokeTestResult>;
  sendChatMessage(
    provider: SmokeProvider,
    message: string,
    model?: string,
    sessionId?: string,
    cwd?: string
  ): Promise<SendChatMessageResult>;
  cancelChatMessage(
    provider: SmokeProvider,
    sessionId?: string,
    requestId?: string,
    cwd?: string
  ): Promise<CancelChatMessageResult>;
  createChatSession(
    provider: SmokeProvider,
    cwd?: string
  ): Promise<CreateChatSessionResult>;
  getHomeDirectory(): Promise<GetHomeDirectoryResult>;
  chooseWorkingDirectory(startingFolder?: string): Promise<ChooseWorkingDirectoryResult>;
  listDirectory(cwd: string): Promise<ListDirectoryResult>;
  getGitStatus(cwd: string): Promise<GetGitStatusResult>;
  getGitBranches(cwd: string): Promise<GetGitBranchesResult>;
  getGitDiff(cwd: string): Promise<GetGitDiffResult>;
  getGitFileDiff(
    cwd: string,
    path: string,
    originalPath?: string
  ): Promise<GetGitFileDiffResult>;
  switchGitBranch(cwd: string, branch: string): Promise<SwitchGitBranchResult>;
  getProviderModelCatalog(
    provider: SmokeProvider,
    cwd?: string
  ): Promise<GetProviderModelCatalogResult>;
  respondToApproval(
    provider: SmokeProvider,
    approvalId: string,
    outcome: ApprovalOutcome,
    cwd?: string
  ): Promise<RespondToApprovalResult>;
  subscribe(listener: (event: SmokeBridgeEvent) => void): () => void;
}

export class NoopSmokeBridge implements SmokeBridge {
  isAvailable(): boolean {
    return false;
  }

  async startSmokeTest(
    _provider: SmokeProvider,
    _prompt: string
  ): Promise<StartSmokeTestResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async sendChatMessage(
    _provider: SmokeProvider,
    _message: string,
    _model?: string,
    _sessionId?: string,
    _cwd?: string
  ): Promise<SendChatMessageResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async createChatSession(
    _provider: SmokeProvider,
    _cwd?: string
  ): Promise<CreateChatSessionResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getHomeDirectory(): Promise<GetHomeDirectoryResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async chooseWorkingDirectory(
    _startingFolder?: string
  ): Promise<ChooseWorkingDirectoryResult> {
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
    _originalPath?: string
  ): Promise<GetGitFileDiffResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async switchGitBranch(
    _cwd: string,
    _branch: string
  ): Promise<SwitchGitBranchResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async cancelChatMessage(
    _provider: SmokeProvider,
    _sessionId?: string,
    _requestId?: string,
    _cwd?: string
  ): Promise<CancelChatMessageResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getProviderModelCatalog(
    _provider: SmokeProvider,
    _cwd?: string
  ): Promise<GetProviderModelCatalogResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async respondToApproval(
    _provider: SmokeProvider,
    _approvalId: string,
    _outcome: ApprovalOutcome,
    _cwd?: string
  ): Promise<RespondToApprovalResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  subscribe(): () => void {
    return () => {};
  }
}
