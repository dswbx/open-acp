import type { ChatAssistantBlock, ChatMessage, ChatToolCall } from "./types.ts";

export type ChatSurfaceBlock =
  | { kind: "reasoning"; id: string; text: string; isActive: boolean }
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; id: string; tool: ChatToolCall }
  | {
      kind: "reasoning-steps";
      id: string;
      steps: Array<{
        id: string;
        label: string;
        description?: string;
        status: "complete" | "active" | "pending";
      }>;
      isActive: boolean;
    };

export interface ChatSurfaceItem {
  id: string;
  from: "user" | "assistant" | "system";
  authorLabel: string;
  providerLabel: string;
  model?: string;
  text: string;
  timestamp: string;
  isStreaming: boolean;
  isError: boolean;
  blocks: ChatSurfaceBlock[];
  showFallbackThinking: boolean;
}

function isTrailingBlock(
  blocks: readonly ChatAssistantBlock[],
  index: number,
  kind: ChatAssistantBlock["kind"],
): boolean {
  for (let i = index + 1; i < blocks.length; i += 1) {
    if (blocks[i].kind !== kind) return false;
  }
  return true;
}

function toSurfaceBlock(
  block: ChatAssistantBlock,
  index: number,
  allBlocks: readonly ChatAssistantBlock[],
  isStreaming: boolean,
): ChatSurfaceBlock {
  switch (block.kind) {
    case "reasoning":
      return {
        kind: "reasoning",
        id: block.id,
        text: block.text,
        isActive: isStreaming && index === allBlocks.length - 1,
      };
    case "text":
      return { kind: "text", id: block.id, text: block.text };
    case "tool":
      return { kind: "tool", id: block.id, tool: block.tool };
    case "reasoning-steps": {
      const trailing = isTrailingBlock(allBlocks, index, "reasoning-steps");
      return {
        kind: "reasoning-steps",
        id: block.id,
        isActive: isStreaming && trailing,
        steps: block.steps.map((step, stepIndex, steps) => ({
          id: step.id,
          label: step.summary,
          description: step.detail ?? step.updateType.replaceAll("_", " "),
          status: isStreaming && trailing && stepIndex === steps.length - 1 ? "active" : "complete",
        })),
      };
    }
  }
}

export const toChatSurfaceItem = (message: ChatMessage): ChatSurfaceItem => {
  const isStreaming = message.status === "streaming";
  const blocks = (message.blocks ?? []).map((block, index, all) =>
    toSurfaceBlock(block, index, all, isStreaming),
  );
  return {
    id: message.id,
    from: message.author,
    authorLabel: message.author,
    providerLabel: message.provider,
    model: message.model,
    text: message.text,
    timestamp: message.timestamp,
    isStreaming,
    isError: message.status === "error",
    blocks,
    showFallbackThinking:
      isStreaming && message.text.length === 0 && (message.blocks?.length ?? 0) === 0,
  };
};

export const mapChatMessagesToSurface = (messages: readonly ChatMessage[]): ChatSurfaceItem[] =>
  messages.map(toChatSurfaceItem);
