import type { ReplayFixtureEventRecord } from "./e2e.ts";
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
  model?: string;
}

export interface RecordedSession {
  metadata: RecordedSessionMetadata;
  messages: RecordedSessionTranscriptRecord[];
  events: ReplayFixtureEventRecord[];
}
