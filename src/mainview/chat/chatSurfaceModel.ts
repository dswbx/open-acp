import type { ChatMessage } from "./types.ts";

export interface ChatSurfaceItem {
  id: string;
  from: "user" | "assistant" | "system";
  authorLabel: string;
  providerLabel: string;
  model?: string;
  text: string;
  isStreaming: boolean;
  isError: boolean;
}

export const toChatSurfaceItem = (message: ChatMessage): ChatSurfaceItem => ({
  id: message.id,
  from: message.author,
  authorLabel: message.author,
  providerLabel: message.provider,
  model: message.model,
  text:
    message.status === "streaming" && message.text.length === 0
      ? "Streaming..."
      : message.text,
  isStreaming: message.status === "streaming",
  isError: message.status === "error"
});

export const mapChatMessagesToSurface = (
  messages: readonly ChatMessage[]
): ChatSurfaceItem[] => messages.map(toChatSurfaceItem);
