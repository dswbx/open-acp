import type { SmokeProvider } from "../../shared/AppRPC.ts";
import { formatToolPresentation } from "./toolPresentation.ts";
import type { ChatAssistantBlock, ChatMessage, ChatReasoningStep, ChatToolCall } from "./types.ts";

export function createAssistantMessage(
  requestId: string,
  sessionId: string,
  provider: SmokeProvider,
  model?: string,
  startedAt: string = new Date().toISOString(),
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    requestId,
    sessionId,
    author: "assistant",
    provider,
    model,
    text: "",
    timestamp: startedAt,
    turnStartedAt: startedAt,
    status: "streaming",
    blocks: [],
  };
}

function mergeToolCall(current: ChatToolCall | undefined, nextTool: ChatToolCall): ChatToolCall {
  const nextOutput =
    nextTool.output === "" && current?.output !== undefined ? current.output : nextTool.output;
  const merged: ChatToolCall = {
    ...current,
    ...nextTool,
    rawTitle: nextTool.rawTitle ?? current?.rawTitle,
    kind: nextTool.kind ?? current?.kind,
    input: nextTool.input ?? current?.input,
    output: nextOutput ?? current?.output,
    errorText: nextTool.errorText ?? current?.errorText,
  };
  const presentation = formatToolPresentation({
    toolCallId: merged.toolCallId,
    toolTitle: merged.rawTitle,
    toolKind: merged.kind,
    input: merged.input,
    output: merged.output,
    errorText: merged.errorText,
    state: merged.state,
  });
  return {
    ...merged,
    title: presentation.title,
    subtitle: presentation.subtitle,
    shimmerPrefix: presentation.shimmerPrefix,
    fileChange: presentation.fileChange,
  };
}

export function appendTextBlock(
  blocks: readonly ChatAssistantBlock[],
  text: string,
  timestamp?: string,
): ChatAssistantBlock[] {
  if (text.length === 0) return [...blocks];
  const finalizedBlocks = finalizeTrailingReasoningBlock(blocks, timestamp);
  const last = finalizedBlocks[finalizedBlocks.length - 1];
  if (last && last.kind === "text") {
    const next = [...finalizedBlocks];
    next[finalizedBlocks.length - 1] = { ...last, text: `${last.text}${text}` };
    return next;
  }
  return [...finalizedBlocks, { kind: "text", id: crypto.randomUUID(), text }];
}

export function appendReasoningBlock(
  blocks: readonly ChatAssistantBlock[],
  text: string,
  timestamp?: string,
): ChatAssistantBlock[] {
  if (text.length === 0) return [...blocks];
  const last = blocks[blocks.length - 1];
  if (last && last.kind === "reasoning") {
    const next = [...blocks];
    next[blocks.length - 1] = {
      ...last,
      text: `${last.text}${text}`,
      startedAt: last.startedAt ?? timestamp,
    };
    return next;
  }
  return [...blocks, { kind: "reasoning", id: crypto.randomUUID(), text, startedAt: timestamp }];
}

export function finalizeTrailingReasoningBlock(
  blocks: readonly ChatAssistantBlock[],
  timestamp?: string,
): ChatAssistantBlock[] {
  const last = blocks[blocks.length - 1];
  if (!timestamp || !last || last.kind !== "reasoning" || last.endedAt) {
    return [...blocks];
  }
  const next = [...blocks];
  next[blocks.length - 1] = { ...last, endedAt: timestamp };
  return next;
}

export function upsertToolBlock(
  blocks: readonly ChatAssistantBlock[],
  nextTool: ChatToolCall,
): ChatAssistantBlock[] {
  const finalizedBlocks = finalizeTrailingReasoningBlock(blocks, nextTool.timestamp);
  const existingIndex = finalizedBlocks.findIndex(
    (block) => block.kind === "tool" && block.tool.toolCallId === nextTool.toolCallId,
  );
  if (existingIndex < 0) {
    return [
      ...finalizedBlocks,
      { kind: "tool", id: crypto.randomUUID(), tool: mergeToolCall(undefined, nextTool) },
    ];
  }
  const next = [...finalizedBlocks];
  const existing = next[existingIndex];
  if (existing.kind !== "tool") return next;
  next[existingIndex] = { ...existing, tool: mergeToolCall(existing.tool, nextTool) };
  return next;
}

export function appendReasoningStepBlock(
  blocks: readonly ChatAssistantBlock[],
  step: ChatReasoningStep,
): ChatAssistantBlock[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === "reasoning-steps") {
    const existingIndex = last.steps.findIndex((entry) => entry.id === step.id);
    const nextSteps =
      existingIndex < 0
        ? [...last.steps, step]
        : last.steps.map((entry, index) => (index === existingIndex ? step : entry));
    const next = [...blocks];
    next[blocks.length - 1] = { ...last, steps: nextSteps };
    return next;
  }
  return [...blocks, { kind: "reasoning-steps", id: crypto.randomUUID(), steps: [step] }];
}

function hasAssistantProgress(message: ChatMessage): boolean {
  return (message.blocks?.length ?? 0) > 0;
}

export function getAssistantTextFromBlocks(
  blocks: readonly ChatAssistantBlock[] | undefined,
): string {
  return (blocks ?? [])
    .filter(
      (block): block is Extract<ChatAssistantBlock, { kind: "text" }> => block.kind === "text",
    )
    .map((block) => block.text)
    .join("");
}

export function getCompletedAssistantText(message: ChatMessage, stopReason?: string): string {
  if (message.text.length > 0) return message.text;
  const textFromBlocks = getAssistantTextFromBlocks(message.blocks);
  if (textFromBlocks.length > 0) return textFromBlocks;
  if (hasAssistantProgress(message)) return message.text;
  return stopReason === "cancelled"
    ? "(Cancelled before any text returned.)"
    : "(No text returned.)";
}
