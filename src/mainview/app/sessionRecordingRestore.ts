import type {
  RecordedSession,
  RecordedSessionTranscriptRecord,
} from "../../shared/sessionRecording.ts";
import type { ChatStreamEventPayload, SmokeProvider } from "../../shared/AppRPC.ts";
import type { ChatAssistantBlock, ChatMessage } from "../chat/types.ts";
import type { SmokeBridge } from "../bridge/SmokeBridge.ts";
import { useChatStore } from "../state/chatStore.ts";
import { useSessionStore } from "../state/sessionStore.ts";
import { useProviderModelStore } from "../state/providerModelStore.ts";
import { getSelectedModelValue } from "../providerModelCatalogState.ts";
import {
  appendLog,
  createSessionListItem,
  handleApprovalEvent,
  handleChatStreamEvent,
  handleAgentTranscriptEvent,
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
  useChatStore
    .getState()
    .setChatMessages(() =>
      recording.messages.map((record, index) =>
        createChatMessageFromRecord(record, index, sessionId, provider, model),
      ),
    );

  for (const event of recording.events) {
    if (event.type === "agentTranscriptEvent") {
      handleAgentTranscriptEvent(event.payload);
      continue;
    }
    if (event.type === "approvalEvent") {
      handleApprovalEvent(event.payload);
      continue;
    }
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
  return (
    payload.kind !== "session_ready" &&
    payload.kind !== "agent_chunk" &&
    payload.kind !== "agent_thought_chunk" &&
    payload.kind !== "agent_complete" &&
    payload.kind !== "error"
  );
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

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getProviderValue(value: unknown): SmokeProvider | undefined {
  return value === "claude" || value === "opencode" || value === "qwen" || value === "codex"
    ? value
    : undefined;
}
