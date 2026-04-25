import type {
  RecordedSession,
  RecordedSessionTranscriptRecord,
} from "../../shared/sessionRecording.ts";
import type {
  ChatStreamEventPayload,
  ChatToolCallState,
  SmokeProvider,
} from "../../shared/AppRPC.ts";
import { createDefaultProviderSessionModeConfig } from "../../shared/sessionModes.ts";
import type { ChatAssistantBlock, ChatMessage } from "../chat/types.ts";
import type { SmokeBridge } from "../bridge/SmokeBridge.ts";
import { useChatStore } from "../state/chatStore.ts";
import { useSessionStore } from "../state/sessionStore.ts";
import { useProviderModelStore } from "../state/providerModelStore.ts";
import { useSessionModeStore } from "../features/modes/index.ts";
import { getSelectedModelValue } from "../providerModelCatalogState.ts";
import {
  appendLog,
  createSessionListItem,
  handleApprovalEvent,
  handleChatStreamEvent,
  handleAgentTranscriptEvent,
  handlePlanReviewEvent,
  resetReplayAppState,
} from "./appHandlers.ts";

const RECORDED_SESSION_ENDPOINT = "/__open-acp/session-recording";

export function getRecordedSessionIdFromLocation(location: Location): string | undefined {
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("sessionId")?.trim() || params.get("restoreSessionId")?.trim();
  return sessionId && sessionId.length > 0 ? sessionId : undefined;
}

export async function hydrateRecordedSessionFromLocation(
  bridge: SmokeBridge,
  location: Location = window.location,
): Promise<boolean> {
  const sessionId = getRecordedSessionIdFromLocation(location);
  if (!sessionId) return false;

  try {
    const recording = await fetchRecordedSession(sessionId);
    hydrateRecordedSession(recording, bridge);
    return true;
  } catch (error) {
    appendLog({
      provider: useSessionStore.getState().selectedProvider,
      level: "error",
      message:
        error instanceof Error ? error.message : `Failed to restore recorded session ${sessionId}.`,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
}

export function hydrateRecordedSession(recording: RecordedSession, bridge: SmokeBridge): void {
  const sessionId = getStringValue(recording.metadata.sessionId) ?? inferSessionId(recording);
  const provider = getProviderValue(recording.metadata.provider) ?? "codex";
  const cwd = getStringValue(recording.metadata.cwd) ?? "";
  const model = getStringValue(recording.metadata.model);
  const mode = getStringValue(recording.metadata.mode);
  const hasRecordedMessages = recording.messages.length > 0;
  const sessionModel =
    model ??
    getSelectedModelValue(
      useProviderModelStore.getState().selected[provider],
      useProviderModelStore.getState().catalogs[provider],
    );

  resetReplayAppState();
  useSessionStore.getState().applySessionTransition({
    activeSessionId: sessionId,
    isDraftingSession: false,
    selectedProvider: provider,
    draftProvider: provider,
    sessions: (previousSessions) => [
      createSessionListItem(provider, sessionId, cwd, sessionModel),
      ...previousSessions.filter((session) => session.id !== sessionId),
    ],
  });
  useSessionModeStore
    .getState()
    .upsertModeConfig(
      createDefaultProviderSessionModeConfig(
        provider,
        sessionId,
        cwd,
        mode === "plan" ? "plan" : "build",
      ),
    );
  useChatStore
    .getState()
    .setChatMessages(() =>
      recording.messages.map((record, index) =>
        createChatMessageFromRecord(record, index, sessionId, provider, model),
      ),
    );

  let lastRequestId =
    recording.messages
      .map((record) => getStringValue(record.payload.requestId))
      .find((requestId) => Boolean(requestId)) ?? `recorded-${sessionId}`;

  for (const event of recording.events) {
    if (event.type === "agentTranscriptEvent") {
      handleAgentTranscriptEvent(event.payload);
      const syntheticEvent = createChatStreamEventFromTranscript(
        event.payload,
        lastRequestId,
        provider,
        cwd,
      );
      if (syntheticEvent && shouldReplayChatStreamEvent(syntheticEvent, hasRecordedMessages)) {
        handleChatStreamEvent(bridge, syntheticEvent);
      }
      continue;
    }
    if (event.type === "approvalEvent") {
      handleApprovalEvent(event.payload);
      continue;
    }
    if (event.type === "planReviewEvent") {
      handlePlanReviewEvent(event.payload);
      continue;
    }
    lastRequestId = event.payload.requestId;
    if (shouldReplayChatStreamEvent(event.payload, hasRecordedMessages)) {
      handleChatStreamEvent(bridge, event.payload);
    }
  }

  appendLog({
    provider,
    level: "info",
    message: `Restored recorded session ${sessionId.slice(0, 8)}.`,
    timestamp: new Date().toISOString(),
  });
}

async function fetchRecordedSession(sessionId: string): Promise<RecordedSession> {
  const params = new URLSearchParams({ sessionId });
  const response = await fetch(`${RECORDED_SESSION_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to restore recorded session ${sessionId}: ${response.status}.`);
  }
  return (await response.json()) as RecordedSession;
}

function shouldReplayChatStreamEvent(
  payload: ChatStreamEventPayload,
  hasRecordedMessages: boolean,
): boolean {
  if (!hasRecordedMessages) return true;
  if (
    payload.kind === "reasoning_update" &&
    payload.updateType === "plan" &&
    payload.summary === "plan"
  ) {
    return false;
  }
  return (
    payload.kind !== "session_ready" &&
    payload.kind !== "agent_chunk" &&
    payload.kind !== "agent_thought_chunk" &&
    payload.kind !== "agent_complete" &&
    payload.kind !== "error"
  );
}

function createChatStreamEventFromTranscript(
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

function createChatMessageFromRecord(
  record: RecordedSessionTranscriptRecord,
  index: number,
  sessionId: string,
  fallbackProvider: SmokeProvider,
  fallbackModel?: string,
): ChatMessage {
  const provider = getProviderValue(record.payload.provider) ?? fallbackProvider;
  const requestId = getStringValue(record.payload.requestId);
  const model = getStringValue(record.payload.model) ?? fallbackModel;
  const text = getStringValue(record.payload.text) ?? "";
  const reasoningText = getStringValue(record.payload.reasoningText);
  const status = getChatMessageStatus(record);
  const isAssistant = record.type === "assistant_message";
  const blocks: ChatAssistantBlock[] | undefined = isAssistant ? [] : undefined;
  if (blocks) {
    if (reasoningText) {
      blocks.push({
        kind: "reasoning",
        id: `recorded-${sessionId}-${index}-reasoning`,
        text: reasoningText,
      });
    }
    if (text) {
      blocks.push({ kind: "text", id: `recorded-${sessionId}-${index}-text`, text });
    }
  }

  return {
    id: `recorded-${sessionId}-${index}`,
    requestId,
    sessionId,
    author: isAssistant ? "assistant" : record.type === "system_message" ? "system" : "user",
    provider,
    model,
    text: isAssistant ? "" : text,
    timestamp: record.timestamp,
    status,
    blocks,
  };
}

function getChatMessageStatus(record: RecordedSessionTranscriptRecord): ChatMessage["status"] {
  const status = getStringValue(record.payload.status);
  if (status === "error") return "error";
  if (status === "streaming") return "streaming";
  return "complete";
}

function inferSessionId(recording: RecordedSession): string {
  for (const event of recording.events) {
    const sessionId = getStringValue(event.payload.sessionId);
    if (sessionId) return sessionId;
  }
  return "recorded-session";
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
