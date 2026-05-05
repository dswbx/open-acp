import type { RecordedSession } from "../../shared/sessionRecording.ts";
import type { SmokeProvider } from "../../shared/AppRPC.ts";
import { createDefaultProviderSessionModeConfig } from "../../shared/sessionModes.ts";
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
  handleAgentTranscriptEvent,
  handlePlanReviewEvent,
  resetReplayAppState,
} from "./appHandlers.ts";
import { createChatMessagesFromRecording } from "./recordingChatMessages.ts";

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
  const restoredMessages = createChatMessagesFromRecording(recording, {
    sessionId,
    provider,
    cwd,
    model,
    idPrefix: "recorded",
  });

  for (const event of recording.events) {
    if (event.type === "agentTranscriptEvent") {
      handleAgentTranscriptEvent(event.payload);
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
  }

  useChatStore.getState().setChatMessages(() => restoredMessages);

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
