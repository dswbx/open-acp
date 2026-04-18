import type { ChatToolCallState, SmokeProvider } from "../../shared/AppRPC.ts";

export type ChatAuthor = "user" | "assistant" | "system";

export interface ChatReasoningStep {
  id: string;
  summary: string;
  detail?: string;
  updateType: string;
  timestamp: string;
}

export interface ChatToolCall {
  toolCallId: string;
  title: string;
  subtitle?: string;
  rawTitle?: string;
  kind?: string;
  state: ChatToolCallState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  requestId?: string;
  sessionId?: string;
  author: ChatAuthor;
  provider: SmokeProvider;
  model?: string;
  text: string;
  timestamp: string;
  status?: "streaming" | "complete" | "error";
  reasoningSteps?: ChatReasoningStep[];
  tools?: ChatToolCall[];
}
