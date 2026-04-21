import type { ChatMessage } from "./types.ts";

function joinReasoningText(message: ChatMessage): string {
  return [message.reasoningText, message.pendingText].filter(Boolean).join("");
}

export interface ChatSurfaceItem {
  id: string;
  from: "user" | "assistant" | "system";
  authorLabel: string;
  providerLabel: string;
  model?: string;
  text: string;
  reasoningText: string;
  isStreaming: boolean;
  isError: boolean;
  reasoningSteps: Array<{
    id: string;
    label: string;
    description?: string;
    status: "complete" | "active" | "pending";
  }>;
  tools: NonNullable<ChatMessage["tools"]>;
  showFallbackThinking: boolean;
}

export const toChatSurfaceItem = (message: ChatMessage): ChatSurfaceItem => ({
  id: message.id,
  from: message.author,
  authorLabel: message.author,
  providerLabel: message.provider,
  model: message.model,
  text: `${message.text}${message.pendingAnswerText ?? ""}`,
  reasoningText: joinReasoningText(message),
  isStreaming: message.status === "streaming",
  isError: message.status === "error",
  reasoningSteps: (message.reasoningSteps ?? []).map((step, index, steps) => ({
    id: step.id,
    label: step.summary,
    description: step.detail ?? step.updateType.replaceAll("_", " "),
    status: message.status === "streaming" && index === steps.length - 1 ? "active" : "complete",
  })),
  tools: message.tools ?? [],
  showFallbackThinking:
    message.status === "streaming" &&
    message.text.length === 0 &&
    (message.reasoningText?.length ?? 0) === 0 &&
    (message.pendingText?.length ?? 0) === 0 &&
    (message.pendingAnswerText?.length ?? 0) === 0 &&
    (message.reasoningSteps?.length ?? 0) === 0 &&
    (message.tools?.length ?? 0) === 0,
});

export const mapChatMessagesToSurface = (messages: readonly ChatMessage[]): ChatSurfaceItem[] =>
  messages.map(toChatSurfaceItem);
