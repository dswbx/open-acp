import type { ChatAssistantBlock, ChatMessage, ChatToolCall } from "./types.ts";

export type ChatSurfaceBlock =
  | {
      kind: "reasoning";
      id: string;
      text: string;
      isActive: boolean;
      startedAt?: string;
      endedAt?: string;
    }
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; id: string; tool: ChatToolCall }
  | {
      kind: "reasoning-steps";
      id: string;
      steps: Array<{
        id: string;
        label: string;
        description?: string;
        updateType: string;
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
  turnStartedAt?: string;
  turnEndedAt?: string;
  isStreaming: boolean;
  isError: boolean;
  blocks: ChatSurfaceBlock[];
  intermediateBlockCount: number;
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
        ...(block.startedAt ? { startedAt: block.startedAt } : {}),
        ...(block.endedAt ? { endedAt: block.endedAt } : {}),
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
          updateType: step.updateType,
          status: isStreaming && trailing && stepIndex === steps.length - 1 ? "active" : "complete",
        })),
      };
    }
  }
}

function deriveTurnSpanFromBlocks(blocks: readonly ChatAssistantBlock[]): {
  startedAt?: string;
  endedAt?: string;
} {
  const stamps: string[] = [];
  for (const block of blocks) {
    if (block.kind === "reasoning") {
      if (block.startedAt) stamps.push(block.startedAt);
      if (block.endedAt) stamps.push(block.endedAt);
    } else if (block.kind === "tool") {
      stamps.push(block.tool.timestamp);
    } else if (block.kind === "reasoning-steps") {
      for (const step of block.steps) stamps.push(step.timestamp);
    }
  }
  if (stamps.length === 0) return {};
  let earliest = stamps[0];
  let latest = stamps[0];
  for (const stamp of stamps) {
    if (stamp < earliest) earliest = stamp;
    if (stamp > latest) latest = stamp;
  }
  return { startedAt: earliest, endedAt: latest };
}

export const toChatSurfaceItem = (message: ChatMessage): ChatSurfaceItem => {
  const isStreaming = message.status === "streaming";
  const rawBlocks = message.blocks ?? [];
  const blocks = rawBlocks.map((block, index, all) =>
    toSurfaceBlock(block, index, all, isStreaming),
  );
  const intermediateBlockCount = firstTrailingTextIndex(blocks);
  const derived = deriveTurnSpanFromBlocks(rawBlocks);
  return {
    id: message.id,
    from: message.author,
    authorLabel: message.author,
    providerLabel: message.provider,
    model: message.model,
    text: message.text,
    timestamp: message.timestamp,
    turnStartedAt: message.turnStartedAt ?? derived.startedAt,
    turnEndedAt: message.turnEndedAt ?? derived.endedAt,
    isStreaming,
    isError: message.status === "error",
    blocks,
    intermediateBlockCount,
    showFallbackThinking:
      isStreaming && message.text.length === 0 && (message.blocks?.length ?? 0) === 0,
  };
};

export const mapChatMessagesToSurface = (messages: readonly ChatMessage[]): ChatSurfaceItem[] =>
  messages.map(toChatSurfaceItem);

export function firstTrailingTextIndex(blocks: readonly ChatSurfaceBlock[]): number {
  let i = blocks.length;
  while (i > 0 && blocks[i - 1].kind === "text") {
    i -= 1;
  }
  return i;
}
