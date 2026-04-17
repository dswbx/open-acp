import type {
   AgentTranscriptEventPayload,
   ApprovalOutcome,
   ApprovalEventPayload,
   CancelChatMessageResult,
   ChatStreamEventPayload,
   CreateChatSessionResult,
   GetProviderModelCatalogResult,
   RespondToApprovalResult,
   SmokeEventPayload,
   SmokeFinishedPayload,
   SmokeProvider,
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
    sessionId?: string
  ): Promise<SendChatMessageResult>;
  cancelChatMessage(
    provider: SmokeProvider,
    sessionId?: string,
    requestId?: string
  ): Promise<CancelChatMessageResult>;
  createChatSession(
    provider: SmokeProvider
  ): Promise<CreateChatSessionResult>;
  getProviderModelCatalog(
    provider: SmokeProvider
  ): Promise<GetProviderModelCatalogResult>;
  respondToApproval(
    provider: SmokeProvider,
    approvalId: string,
    outcome: ApprovalOutcome
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
    _sessionId?: string
  ): Promise<SendChatMessageResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async createChatSession(
    _provider: SmokeProvider
  ): Promise<CreateChatSessionResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async cancelChatMessage(
    _provider: SmokeProvider,
    _sessionId?: string,
    _requestId?: string
  ): Promise<CancelChatMessageResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async getProviderModelCatalog(
    _provider: SmokeProvider
  ): Promise<GetProviderModelCatalogResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  async respondToApproval(
    _provider: SmokeProvider,
    _approvalId: string,
    _outcome: ApprovalOutcome
  ): Promise<RespondToApprovalResult> {
    throw new Error("Electrobun bridge is not available in this environment.");
  }

  subscribe(): () => void {
    return () => {};
  }
}
