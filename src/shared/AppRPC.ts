import type { RPCSchema } from "electrobun/bun";

export type SmokeProvider = "codex" | "claude" | "opencode";
export type SmokeEventLevel = "info" | "update" | "error";

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
  model?: string;
}

export interface CreateChatSessionParams {
  provider: SmokeProvider;
  cwd?: string;
}

export interface CreateChatSessionResult {
  provider: SmokeProvider;
  sessionId: string;
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

export type ChatStreamEventKind =
  | "session_ready"
  | "agent_chunk"
  | "agent_complete"
  | "error";

export interface ChatStreamEventPayload {
  requestId: string;
  provider: SmokeProvider;
  sessionId: string;
  kind: ChatStreamEventKind;
  text?: string;
  stopReason?: string;
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
      createChatSession: {
        params: CreateChatSessionParams;
        response: CreateChatSessionResult;
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      smokeEvent: SmokeEventPayload;
      smokeFinished: SmokeFinishedPayload;
      chatStreamEvent: ChatStreamEventPayload;
    };
  }>;
};
