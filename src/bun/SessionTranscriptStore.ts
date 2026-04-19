import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReplayFixtureEventRecord, ReplayFixtureMetadata } from "../shared/e2e.ts";

export type SessionTranscriptRecordType = "user_message" | "assistant_message" | "system_message";

export interface SessionTranscriptRecord {
  timestamp: string;
  type: SessionTranscriptRecordType;
  payload: Record<string, unknown>;
}

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
