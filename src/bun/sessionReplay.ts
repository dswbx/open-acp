import type { SessionTranscriptStore } from "./SessionTranscriptStore.ts";
import type { ReplayFixtureEventRecord } from "../shared/e2e.ts";
import type { NormalizedSessionMode, SmokeProvider } from "../shared/AppRPC.ts";
import { logger } from "../shared/logger.ts";

export function createTimestamp(): string {
  return new Date().toISOString();
}

export interface SessionReplayRecorderOptions {
  store: SessionTranscriptStore;
  workspaceRoot: string;
}

export interface TranscriptRecord {
  timestamp: string;
  type: "user_message" | "assistant_message" | "system_message";
  payload: Record<string, unknown>;
}

export interface ReplayMetadataInput {
  sessionId: string;
  workspaceId?: string;
  provider: SmokeProvider;
  cwd: string;
  model?: string;
  mode?: NormalizedSessionMode;
  transport?: "acp" | "codex-native";
  providerSessionId?: string;
  currentModeId?: string;
}

export interface SessionReplayRecorder {
  appendTranscriptRecord(sessionId: string, record: TranscriptRecord): void;
  writeMetadata(input: ReplayMetadataInput): void;
  appendEvent(sessionId: string, event: ReplayFixtureEventRecord): void;
}

export function createSessionReplayRecorder({
  store,
  workspaceRoot,
}: SessionReplayRecorderOptions): SessionReplayRecorder {
  const workspaceIdsBySession = new Map<string, string>();
  return {
    appendTranscriptRecord(sessionId, record) {
      void store
        .appendRecord({
          cwd: workspaceRoot,
          sessionId,
          workspaceId: workspaceIdsBySession.get(sessionId),
          record,
        })
        .catch((error) => {
          logger.error("Failed to append session transcript", error as Error, { sessionId });
        });
    },
    writeMetadata(input) {
      if (input.workspaceId) {
        workspaceIdsBySession.set(input.sessionId, input.workspaceId);
      }
      const recordedAt = createTimestamp();
      void store
        .writeMetadata({
          cwd: workspaceRoot,
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          metadata: {
            schemaVersion: 1,
            fixtureName: "raw-recording",
            workspaceId: input.workspaceId,
            provider: input.provider,
            cwd: input.cwd,
            sessionId: input.sessionId,
            model: input.model,
            mode: input.mode,
            transport: input.transport,
            providerSessionId: input.providerSessionId,
            currentModeId: input.currentModeId,
            createdAt: recordedAt,
            recordedAt,
          },
        })
        .catch((error) => {
          logger.error("Failed to write session replay metadata", error as Error, {
            sessionId: input.sessionId,
          });
        });
    },
    appendEvent(sessionId, event) {
      void store
        .appendEvent({
          cwd: workspaceRoot,
          sessionId,
          workspaceId: workspaceIdsBySession.get(sessionId),
          event,
        })
        .catch((error) => {
          logger.error("Failed to append session event transcript", error as Error, { sessionId });
        });
    },
  };
}
