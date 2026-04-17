import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type SessionTranscriptRecordType =
  | "user_message"
  | "assistant_message"
  | "system_message";

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
}

export function sanitizeSessionId(sessionId: string): string {
  return encodeURIComponent(sessionId);
}
