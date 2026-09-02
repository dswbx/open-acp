import type { ReplayFixtureEventRecord } from "./e2e.ts";
import type { NormalizedSessionMode } from "./AppRPC.ts";
import type { SmokeProvider } from "./providerModels.ts";

export type RecordedSessionTranscriptRecordType =
  | "user_message"
  | "assistant_message"
  | "system_message";

export interface RecordedSessionTranscriptRecord {
  timestamp: string;
  type: RecordedSessionTranscriptRecordType;
  payload: Record<string, unknown>;
}

export interface RecordedSessionMetadata extends Record<string, unknown> {
  provider?: SmokeProvider;
  cwd?: string;
  sessionId?: string;
  title?: string;
  model?: string;
  mode?: NormalizedSessionMode;
  transport?: "acp" | "codex-native";
  providerSessionId?: string;
  currentModeId?: string;
  createdAt?: string;
  recordedAt?: string;
}

export interface RecordedSession {
  metadata: RecordedSessionMetadata;
  messages: RecordedSessionTranscriptRecord[];
  events: ReplayFixtureEventRecord[];
}

export interface StoredSessionSummary {
  sessionId: string;
  workspaceId?: string;
  provider: SmokeProvider;
  title?: string;
  cwd: string;
  model?: string;
  mode?: NormalizedSessionMode;
  createdAt?: string;
  updatedAt: string;
}

export type ListStoredSessionsParams = Record<string, never>;

export interface ListStoredSessionsResult {
  sessions: StoredSessionSummary[];
}

export interface GetStoredSessionRecordingParams {
  sessionId: string;
  workspaceId?: string;
}

export interface GetStoredSessionRecordingResult {
  recording: RecordedSession;
}

export interface RenameStoredSessionParams {
  sessionId: string;
  workspaceId?: string;
  title: string;
}

export interface RenameStoredSessionResult {
  session: StoredSessionSummary;
}

export interface DeleteStoredSessionParams {
  sessionId: string;
  workspaceId?: string;
}

export interface DeleteStoredSessionResult {
  sessionId: string;
  workspaceId?: string;
  deleted: boolean;
}
