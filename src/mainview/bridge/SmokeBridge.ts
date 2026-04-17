import type {
  ChatStreamEventPayload,
  CreateChatSessionResult,
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
  createChatSession(
    provider: SmokeProvider
  ): Promise<CreateChatSessionResult>;
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

  subscribe(): () => void {
    return () => {};
  }
}
