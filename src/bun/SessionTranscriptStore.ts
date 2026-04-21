import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReplayFixtureEventRecord, ReplayFixtureMetadata } from "../shared/e2e.ts";
import type {
  RecordedSession,
  RecordedSessionTranscriptRecord,
  RecordedSessionTranscriptRecordType,
} from "../shared/sessionRecording.ts";

export type SessionTranscriptRecordType = RecordedSessionTranscriptRecordType;

export type SessionTranscriptRecord = RecordedSessionTranscriptRecord;

interface AppendSessionRecordParams {
  cwd: string;
  sessionId: string;
  record: SessionTranscriptRecord;
}

interface AppendSessionEventParams {
  cwd: string;
  sessionId: string;
  event: ReplayFixtureEventRecord;
}

interface WriteSessionMetadataParams {
  cwd: string;
  sessionId: string;
  metadata: Partial<ReplayFixtureMetadata> & Record<string, unknown>;
}

export class SessionTranscriptStore {
  private readonly pendingWrites = new Map<string, Promise<void>>();

  async appendRecord(params: AppendSessionRecordParams): Promise<void> {
    const filePath = this.getSessionLogPath(params.cwd, params.sessionId);
    const nextWrite = (this.pendingWrites.get(filePath) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await appendFile(filePath, `${JSON.stringify(params.record)}\n`, "utf8");
      });

    this.pendingWrites.set(filePath, nextWrite);

    try {
      await nextWrite;
    } finally {
      if (this.pendingWrites.get(filePath) === nextWrite) {
        this.pendingWrites.delete(filePath);
      }
    }
  }

  getSessionDirectory(cwd: string, sessionId: string): string {
    return path.join(cwd, ".acp", "sessions", sanitizeSessionId(sessionId));
  }

  getSessionLogPath(cwd: string, sessionId: string): string {
    return path.join(this.getSessionDirectory(cwd, sessionId), "messages.jsonl");
  }

  async appendEvent(params: AppendSessionEventParams): Promise<void> {
    const filePath = this.getSessionEventLogPath(params.cwd, params.sessionId);
    await this.writeLine(filePath, params.event);
  }

  async writeMetadata(params: WriteSessionMetadataParams): Promise<void> {
    const filePath = this.getSessionMetadataPath(params.cwd, params.sessionId);
    const nextWrite = (this.pendingWrites.get(filePath) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, JSON.stringify(params.metadata, null, 2), "utf8");
      });

    this.pendingWrites.set(filePath, nextWrite);

    try {
      await nextWrite;
    } finally {
      if (this.pendingWrites.get(filePath) === nextWrite) {
        this.pendingWrites.delete(filePath);
      }
    }
  }

  async readRecording(cwd: string, sessionId: string): Promise<RecordedSession> {
    const [metadataText, messagesText, eventsText] = await Promise.all([
      readFile(this.getSessionMetadataPath(cwd, sessionId), "utf8"),
      readFile(this.getSessionLogPath(cwd, sessionId), "utf8").catch((error: unknown) => {
        if (isFileNotFoundError(error)) return "";
        throw error;
      }),
      readFile(this.getSessionEventLogPath(cwd, sessionId), "utf8").catch((error: unknown) => {
        if (isFileNotFoundError(error)) return "";
        throw error;
      }),
    ]);

    return {
      metadata: JSON.parse(metadataText) as RecordedSession["metadata"],
      messages: parseJsonLines<RecordedSessionTranscriptRecord>(messagesText),
      events: parseJsonLines<ReplayFixtureEventRecord>(eventsText),
    };
  }

  getSessionEventLogPath(cwd: string, sessionId: string): string {
    return path.join(this.getSessionDirectory(cwd, sessionId), "events.jsonl");
  }

  getSessionMetadataPath(cwd: string, sessionId: string): string {
    return path.join(this.getSessionDirectory(cwd, sessionId), "metadata.json");
  }

  private async writeLine(filePath: string, value: unknown): Promise<void> {
    const nextWrite = (this.pendingWrites.get(filePath) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
      });

    this.pendingWrites.set(filePath, nextWrite);

    try {
      await nextWrite;
    } finally {
      if (this.pendingWrites.get(filePath) === nextWrite) {
        this.pendingWrites.delete(filePath);
      }
    }
  }
}

export function sanitizeSessionId(sessionId: string): string {
  return encodeURIComponent(sessionId);
}

function parseJsonLines<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
