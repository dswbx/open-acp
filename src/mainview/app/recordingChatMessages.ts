import type {
  ApprovalEventPayload,
  ChatStreamEventPayload,
  ChatToolCallState,
  SmokeProvider,
} from "../../shared/AppRPC.ts";
import type {
  RecordedSession,
  RecordedSessionTranscriptRecord,
} from "../../shared/sessionRecording.ts";
import {
  appendReasoningBlock,
  appendReasoningStepBlock,
  appendTextBlock,
  finalizeTrailingReasoningBlock,
  getAssistantTextFromBlocks,
  getCompletedAssistantText,
  upsertToolBlock,
} from "../chat/chatBlockMutations.ts";
import type { ChatAssistantBlock, ChatMessage } from "../chat/types.ts";

interface CreateChatMessagesFromRecordingOptions {
  sessionId: string;
  provider: SmokeProvider;
  cwd: string;
  model?: string;
  idPrefix: string;
}

export function createChatMessagesFromRecording(
  recording: RecordedSession,
  options: CreateChatMessagesFromRecordingOptions,
): ChatMessage[] {
  const messages = recording.messages.map((record, index) =>
    createChatMessageFromRecord(record, index, options),
  );
  const assistantIndexesByRequestId = new Map<string, number>();

  messages.forEach((message, index) => {
    if (message.author === "assistant" && message.requestId) {
      assistantIndexesByRequestId.set(message.requestId, index);
    }
  });

  let lastRequestId =
    recording.messages
      .map((record) => getStringValue(record.payload.requestId))
      .find((requestId) => Boolean(requestId)) ?? `${options.idPrefix}-${options.sessionId}`;

  for (const event of recording.events) {
    if (event.type === "chatStreamEvent") {
      lastRequestId = event.payload.requestId;
      applyChatStreamEvent(messages, assistantIndexesByRequestId, event.payload, options);
      continue;
    }

    if (event.type === "approvalEvent") {
      applyApprovalEvent(messages, assistantIndexesByRequestId, event.payload, options);
      continue;
    }

    if (event.type !== "agentTranscriptEvent") {
      continue;
    }

    const syntheticEvent = createChatStreamEventFromTranscript(
      event.payload,
      lastRequestId,
      options.provider,
      options.cwd,
    );
    if (syntheticEvent) {
      applyChatStreamEvent(messages, assistantIndexesByRequestId, syntheticEvent, options);
    }
  }

  return messages.map((message, index) =>
    applyTranscriptFallback(message, recording.messages[index], options),
  );
}

function createChatMessageFromRecord(
  record: RecordedSessionTranscriptRecord,
  index: number,
  options: CreateChatMessagesFromRecordingOptions,
): ChatMessage {
  const provider = getProviderValue(record.payload.provider) ?? options.provider;
  const requestId = getStringValue(record.payload.requestId);
  const model = getStringValue(record.payload.model) ?? options.model;
  const text = getStringValue(record.payload.text) ?? "";
  const isAssistant = record.type === "assistant_message";

  return {
    id: `${options.idPrefix}-${options.sessionId}-${index}`,
    requestId,
    sessionId: options.sessionId,
    author: isAssistant ? "assistant" : record.type === "system_message" ? "system" : "user",
    provider,
    model,
    text: isAssistant ? "" : text,
    timestamp: record.timestamp,
    status: getChatMessageStatus(record),
    blocks: isAssistant ? [] : undefined,
  };
}

function applyChatStreamEvent(
  messages: ChatMessage[],
  assistantIndexesByRequestId: Map<string, number>,
  payload: ChatStreamEventPayload,
  options: CreateChatMessagesFromRecordingOptions,
): void {
  if (payload.kind === "session_ready" || payload.kind === "usage_update") {
    return;
  }

  if (
    payload.kind === "reasoning_update" &&
    payload.updateType === "plan" &&
    payload.summary === "plan"
  ) {
    return;
  }

  const message = getOrCreateAssistantMessage(
    messages,
    assistantIndexesByRequestId,
    payload.requestId,
    payload.sessionId,
    payload.provider,
    options.model,
    payload.timestamp,
  );

  if (payload.kind === "agent_chunk") {
    message.blocks = appendTextBlock(message.blocks ?? [], payload.text ?? "", payload.timestamp);
    message.status = "streaming";
    message.timestamp = payload.timestamp;
    message.turnStartedAt = message.turnStartedAt ?? payload.timestamp;
    return;
  }

  if (payload.kind === "agent_thought_chunk") {
    message.blocks = appendReasoningBlock(
      message.blocks ?? [],
      payload.text ?? "",
      payload.timestamp,
    );
    message.status = "streaming";
    message.timestamp = payload.timestamp;
    message.turnStartedAt = message.turnStartedAt ?? payload.timestamp;
    return;
  }

  if (payload.kind === "reasoning_update") {
    message.blocks = appendReasoningStepBlock(message.blocks ?? [], {
      id: payload.eventId,
      summary: payload.summary,
      detail: payload.detail,
      updateType: payload.updateType,
      timestamp: payload.timestamp,
    });
    message.timestamp = payload.timestamp;
    message.turnStartedAt = message.turnStartedAt ?? payload.timestamp;
    return;
  }

  if (payload.kind === "tool_call" || payload.kind === "tool_call_update") {
    message.blocks = upsertToolBlock(message.blocks ?? [], {
      toolCallId: payload.toolCallId,
      title: "",
      rawTitle: payload.toolTitle,
      kind: payload.toolKind,
      state: payload.toolState,
      input: payload.input,
      output: payload.output,
      errorText: payload.errorText,
      timestamp: payload.timestamp,
    });
    message.timestamp = payload.timestamp;
    message.turnStartedAt = message.turnStartedAt ?? payload.timestamp;
    return;
  }

  if (payload.kind === "agent_complete") {
    message.status = "complete";
    message.timestamp = payload.timestamp;
    message.turnStartedAt = message.turnStartedAt ?? payload.timestamp;
    message.turnEndedAt = payload.timestamp;
    message.blocks = finalizeTrailingReasoningBlock(message.blocks ?? [], payload.timestamp);
    message.text = getCompletedAssistantText(message, payload.stopReason);
    return;
  }

  if (payload.kind === "error") {
    message.status = "error";
    message.text = payload.text ?? (message.text || "Request failed.");
    message.timestamp = payload.timestamp;
    message.turnStartedAt = message.turnStartedAt ?? payload.timestamp;
    message.turnEndedAt = payload.timestamp;
  }
}

function applyApprovalEvent(
  messages: ChatMessage[],
  assistantIndexesByRequestId: Map<string, number>,
  payload: ApprovalEventPayload,
  options: CreateChatMessagesFromRecordingOptions,
): void {
  if (!payload.requestId) {
    return;
  }

  const message = getOrCreateAssistantMessage(
    messages,
    assistantIndexesByRequestId,
    payload.requestId,
    payload.sessionId,
    payload.provider,
    options.model,
    payload.timestamp,
  );

  const existingTool = (message.blocks ?? []).find(
    (block): block is Extract<ChatAssistantBlock, { kind: "tool" }> =>
      block.kind === "tool" && block.tool.toolCallId === payload.toolCallId,
  )?.tool;

  const state: ChatToolCallState =
    payload.kind === "requested" ? "approval-requested" : "approval-responded";

  message.blocks = upsertToolBlock(message.blocks ?? [], {
    toolCallId: payload.toolCallId,
    title: "",
    rawTitle: existingTool?.rawTitle,
    kind: payload.kind === "requested" ? payload.toolKind : existingTool?.kind,
    state,
    input: payload.kind === "requested" ? payload.rawInput : existingTool?.input,
    output: existingTool?.output,
    errorText: existingTool?.errorText,
    timestamp: payload.timestamp,
  });
  message.timestamp = payload.timestamp;
  message.turnStartedAt = message.turnStartedAt ?? payload.timestamp;
}

function getOrCreateAssistantMessage(
  messages: ChatMessage[],
  assistantIndexesByRequestId: Map<string, number>,
  requestId: string,
  sessionId: string,
  provider: SmokeProvider,
  model: string | undefined,
  timestamp: string,
): ChatMessage {
  const existingIndex = assistantIndexesByRequestId.get(requestId);
  if (existingIndex !== undefined) {
    return messages[existingIndex];
  }

  const message: ChatMessage = {
    id: `replayed-${sessionId}-${requestId}`,
    requestId,
    sessionId,
    author: "assistant",
    provider,
    model,
    text: "",
    timestamp,
    turnStartedAt: timestamp,
    status: "streaming",
    blocks: [],
  };
  assistantIndexesByRequestId.set(requestId, messages.length);
  messages.push(message);
  return message;
}

function applyTranscriptFallback(
  message: ChatMessage,
  record: RecordedSessionTranscriptRecord | undefined,
  options: CreateChatMessagesFromRecordingOptions,
): ChatMessage {
  if (!record || message.author !== "assistant") {
    return message;
  }

  const transcriptText = getStringValue(record.payload.text) ?? "";
  const reasoningText = getStringValue(record.payload.reasoningText);
  const transcriptStatus = getChatMessageStatus(record);
  let blocks = message.blocks ?? [];

  if (blocks.length === 0) {
    if (reasoningText) {
      blocks = [
        ...blocks,
        {
          kind: "reasoning",
          id: `${options.idPrefix}-${options.sessionId}-${record.timestamp}-reasoning`,
          text: reasoningText,
        },
      ];
    }
    if (transcriptText) {
      blocks = [
        ...blocks,
        {
          kind: "text",
          id: `${options.idPrefix}-${options.sessionId}-${record.timestamp}-text`,
          text: transcriptText,
        },
      ];
    }
    return {
      ...message,
      blocks,
      text: "",
      status: message.status === "streaming" ? transcriptStatus : message.status,
      turnEndedAt: message.turnEndedAt ?? record.timestamp,
      timestamp: message.timestamp || record.timestamp,
    };
  }

  const blockText = getAssistantTextFromBlocks(blocks);
  if (transcriptText && blockText.length === 0) {
    blocks = appendTextBlock(blocks, transcriptText, record.timestamp);
  } else if (
    transcriptText &&
    transcriptText.startsWith(blockText) &&
    transcriptText !== blockText
  ) {
    blocks = appendTextBlock(blocks, transcriptText.slice(blockText.length), record.timestamp);
  }

  return {
    ...message,
    blocks,
    text: "",
    status: message.status === "streaming" ? transcriptStatus : message.status,
    turnEndedAt: message.turnEndedAt ?? record.timestamp,
  };
}

export function createChatStreamEventFromTranscript(
  payload: RecordedSession["events"][number]["payload"],
  requestId: string,
  fallbackProvider: SmokeProvider,
  fallbackCwd: string,
): ChatStreamEventPayload | undefined {
  if (
    payload.kind !== "notification" ||
    payload.method !== "session/update" ||
    typeof payload.json !== "string"
  ) {
    return undefined;
  }

  const message = parseJsonObject(payload.json);
  const params = isRecord(message.params) ? message.params : undefined;
  const update = isRecord(params?.update) ? params.update : undefined;
  if (!update || typeof update.sessionUpdate !== "string") {
    return undefined;
  }

  const provider = getProviderValue(payload.provider) ?? fallbackProvider;
  const sessionId = getStringValue(payload.sessionId) ?? getStringValue(params?.sessionId);
  if (!sessionId) {
    return undefined;
  }

  if (update.sessionUpdate === "tool_call") {
    const toolCallId = getStringValue(update.toolCallId);
    if (!toolCallId) {
      return undefined;
    }
    return {
      requestId,
      provider,
      sessionId,
      cwd: fallbackCwd,
      kind: "tool_call",
      toolCallId,
      toolTitle: getStringValue(update.title),
      toolKind: getStringValue(update.kind) ?? getToolName(update),
      toolState: mapRecordedToolState(getStringValue(update.status)),
      input: update.rawInput ?? update.input,
      timestamp: payload.timestamp,
    };
  }

  if (update.sessionUpdate === "tool_call_update") {
    const toolCallId = getStringValue(update.toolCallId);
    if (!toolCallId) {
      return undefined;
    }
    const rawOutput = update.rawOutput ?? update.output;
    return {
      requestId,
      provider,
      sessionId,
      cwd: fallbackCwd,
      kind: "tool_call_update",
      toolCallId,
      toolTitle: getStringValue(update.title),
      toolKind: getStringValue(update.kind) ?? getToolName(update),
      toolState: mapRecordedToolState(getStringValue(update.status)),
      output: hasMeaningfulOutput(rawOutput) ? rawOutput : (update.content ?? rawOutput),
      timestamp: payload.timestamp,
    };
  }

  if (update.sessionUpdate === "plan") {
    const detail = formatRecordedPlanEntries(update.entries);
    if (!detail) {
      return undefined;
    }
    return {
      requestId,
      provider,
      sessionId,
      cwd: fallbackCwd,
      kind: "reasoning_update",
      eventId: payload.entryId,
      updateType: "plan",
      summary: "Updated tasks",
      detail,
      timestamp: payload.timestamp,
    };
  }

  return undefined;
}

function getChatMessageStatus(record: RecordedSessionTranscriptRecord): ChatMessage["status"] {
  const status = getStringValue(record.payload.status);
  if (status === "error") return "error";
  if (status === "streaming") return "streaming";
  return "complete";
}

function mapRecordedToolState(status?: string): ChatToolCallState {
  if (status === "completed" || status === "success") {
    return "output-available";
  }
  if (status === "failed" || status === "error") {
    return "output-error";
  }
  if (status === "cancelled" || status === "denied" || status === "rejected") {
    return "output-denied";
  }
  if (status === "pending") {
    return "input-streaming";
  }
  return "input-available";
}

function hasMeaningfulOutput(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  return true;
}

function getToolName(update: Record<string, unknown>): string | undefined {
  const meta = update._meta;
  if (!isRecord(meta)) {
    return undefined;
  }
  return getStringValue(meta.toolName);
}

function formatRecordedPlanEntries(entries: unknown): string | undefined {
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const lines = entries
    .filter(isRecord)
    .map((entry) => {
      const content = getStringValue(entry.content);
      if (!content) {
        return undefined;
      }
      const status = getStringValue(entry.status)?.replaceAll("_", " ");
      return status ? `${status}: ${content}` : content;
    })
    .filter((line): line is string => Boolean(line));
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getProviderValue(value: unknown): SmokeProvider | undefined {
  return value === "claude" || value === "opencode" || value === "qwen" || value === "codex"
    ? value
    : undefined;
}
