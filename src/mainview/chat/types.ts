import type { SmokeProvider } from "../../shared/AppRPC.ts";

export type ChatAuthor = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  requestId?: string;
  author: ChatAuthor;
  provider: SmokeProvider;
  model?: string;
  text: string;
  timestamp: string;
  status?: "streaming" | "complete" | "error";
}
