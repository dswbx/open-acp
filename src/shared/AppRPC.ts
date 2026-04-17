import type { RPCSchema } from "electrobun/bun";
import type { ProviderModelCatalog, SmokeProvider } from "./providerModels.ts";
export type SmokeEventLevel = "info" | "update" | "error";

export type {
  ProviderModelCatalog,
  ProviderModelOption,
  SmokeProvider
} from "./providerModels.ts";

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
  cancelledAt: string;
}

export interface CreateChatSessionParams {
  provider: SmokeProvider;
  cwd?: string;
}

export interface CreateChatSessionResult {
  provider: SmokeProvider;
  sessionId: string;
}

export interface GetProviderModelCatalogParams {
  provider: SmokeProvider;
  cwd?: string;
}

export interface GetProviderModelCatalogResult {
  provider: SmokeProvider;
  catalog: ProviderModelCatalog;
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
  outcome: ApprovalOutcome;
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

export type ChatStreamEventKind =
  | "session_ready"
  | "agent_chunk"
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
    })
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
      requestId?: string;
      toolCallId: string;
      outcome: ApprovalOutcome;
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
      getProviderModelCatalog: {
        params: GetProviderModelCatalogParams;
        response: GetProviderModelCatalogResult;
      };
      respondToApproval: {
        params: RespondToApprovalParams;
        response: RespondToApprovalResult;
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
      approvalEvent: ApprovalEventPayload;
      agentTranscriptEvent: AgentTranscriptEventPayload;
    };
  }>;
};
