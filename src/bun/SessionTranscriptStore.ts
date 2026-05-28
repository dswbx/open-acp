import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReplayFixtureEventRecord, ReplayFixtureMetadata } from "../shared/e2e.ts";
import type {
  ListStoredSessionsResult,
  RecordedSession,
  RecordedSessionTranscriptRecord,
  RecordedSessionTranscriptRecordType,
  StoredSessionSummary,
} from "../shared/sessionRecording.ts";
import type { NormalizedSessionMode } from "../shared/AppRPC.ts";
import { SMOKE_PROVIDERS, type SmokeProvider } from "../shared/providerModels.ts";
import {
  getOpenAcpSessionDirectory,
  getOpenAcpWorkspaceSessionDirectory,
  getOpenAcpWorkspaceSessionsRoot,
  getOpenAcpWorkspacesRoot,
} from "./openAcpHome.ts";

export type SessionTranscriptRecordType = RecordedSessionTranscriptRecordType;

export type SessionTranscriptRecord = RecordedSessionTranscriptRecord;

interface AppendSessionRecordParams {
  cwd: string;
  sessionId: string;
  workspaceId?: string;
  record: SessionTranscriptRecord;
}

interface AppendSessionEventParams {
  cwd: string;
  sessionId: string;
  workspaceId?: string;
  event: ReplayFixtureEventRecord;
}

interface WriteSessionMetadataParams {
  cwd: string;
  sessionId: string;
  workspaceId?: string;
  metadata: Partial<ReplayFixtureMetadata> & Record<string, unknown>;
}

interface SessionTranscriptStoreOptions {
  homeRoot?: string;
}

export class SessionTranscriptStore {
  private readonly pendingWrites = new Map<string, Promise<void>>();
  private readonly homeRoot?: string;

  constructor(options: SessionTranscriptStoreOptions = {}) {
    this.homeRoot = options.homeRoot;
  }

  async appendRecord(params: AppendSessionRecordParams): Promise<void> {
    const filePath = this.getSessionLogPath(params.cwd, params.sessionId, params.workspaceId);
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

  getSessionDirectory(_cwd: string, sessionId: string, workspaceId?: string): string {
    return workspaceId
      ? getOpenAcpWorkspaceSessionDirectory(workspaceId, sessionId, this.homeRoot)
      : getOpenAcpSessionDirectory(sessionId, this.homeRoot);
  }

  getSessionLogPath(cwd: string, sessionId: string, workspaceId?: string): string {
    return path.join(this.getSessionDirectory(cwd, sessionId, workspaceId), "messages.jsonl");
  }

  async appendEvent(params: AppendSessionEventParams): Promise<void> {
    const filePath = this.getSessionEventLogPath(params.cwd, params.sessionId, params.workspaceId);
    await this.writeLine(filePath, params.event);
  }

  async writeMetadata(params: WriteSessionMetadataParams): Promise<void> {
    const filePath = this.getSessionMetadataPath(params.cwd, params.sessionId, params.workspaceId);
    const nextWrite = (this.pendingWrites.get(filePath) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const existing = await readFile(filePath, "utf8")
          .then(parseJsonObject)
          .catch((error: unknown) => {
            if (isFileNotFoundError(error)) return undefined;
            throw error;
          });
        const createdAt =
          readNonEmptyString(params.metadata.createdAt) ??
          readNonEmptyString(existing?.createdAt) ??
          readNonEmptyString(existing?.recordedAt) ??
          readNonEmptyString(params.metadata.recordedAt) ??
          new Date().toISOString();
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(
          filePath,
          JSON.stringify({ ...params.metadata, createdAt }, null, 2),
          "utf8",
        );
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

  async readRecording(
    cwd: string,
    sessionId: string,
    workspaceId?: string,
  ): Promise<RecordedSession> {
    const [metadataText, messagesText, eventsText] = await Promise.all([
      readFile(this.getSessionMetadataPath(cwd, sessionId, workspaceId), "utf8"),
      readFile(this.getSessionLogPath(cwd, sessionId, workspaceId), "utf8").catch(
        (error: unknown) => {
          if (isFileNotFoundError(error)) return "";
          throw error;
        },
      ),
      readFile(this.getSessionEventLogPath(cwd, sessionId, workspaceId), "utf8").catch(
        (error: unknown) => {
          if (isFileNotFoundError(error)) return "";
          throw error;
        },
      ),
    ]);

    return {
      metadata: JSON.parse(metadataText) as RecordedSession["metadata"],
      messages: parseJsonLines<RecordedSessionTranscriptRecord>(messagesText),
      events: parseJsonLines<ReplayFixtureEventRecord>(eventsText),
    };
  }

  async renameStoredSession(params: {
    sessionId: string;
    workspaceId?: string;
    title: string;
  }): Promise<StoredSessionSummary> {
    const sessionDirectory = this.getSessionDirectory("", params.sessionId, params.workspaceId);
    const metadataPath = path.join(sessionDirectory, "metadata.json");
    const title = params.title.trim();
    if (title.length === 0) {
      throw new Error("Session title cannot be empty.");
    }

    const nextWrite = (this.pendingWrites.get(metadataPath) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const existing = await readFile(metadataPath, "utf8").then(parseJsonObject);
        if (!existing) {
          throw new Error(`Stored session metadata is invalid: ${params.sessionId}`);
        }
        await writeFile(metadataPath, JSON.stringify({ ...existing, title }, null, 2), "utf8");
      });

    this.pendingWrites.set(metadataPath, nextWrite);

    try {
      await nextWrite;
    } finally {
      if (this.pendingWrites.get(metadataPath) === nextWrite) {
        this.pendingWrites.delete(metadataPath);
      }
    }

    const metadata = await readFile(metadataPath, "utf8").then(parseJsonObject);
    const summary = metadata
      ? await toStoredSessionSummary(metadata, sessionDirectory, params.workspaceId)
      : undefined;
    if (!summary) {
      throw new Error(`Stored session metadata is incomplete: ${params.sessionId}`);
    }
    return summary;
  }

  async deleteStoredSession(params: {
    sessionId: string;
    workspaceId?: string;
  }): Promise<{ deleted: boolean }> {
    const sessionDirectory = this.getSessionDirectory("", params.sessionId, params.workspaceId);
    const existed = await stat(sessionDirectory)
      .then((value) => value.isDirectory())
      .catch((error: unknown) => {
        if (isFileNotFoundError(error)) return false;
        throw error;
      });
    await rm(sessionDirectory, { recursive: true, force: true });
    return { deleted: existed };
  }

  getSessionEventLogPath(cwd: string, sessionId: string, workspaceId?: string): string {
    return path.join(this.getSessionDirectory(cwd, sessionId, workspaceId), "events.jsonl");
  }

  getSessionMetadataPath(cwd: string, sessionId: string, workspaceId?: string): string {
    return path.join(this.getSessionDirectory(cwd, sessionId, workspaceId), "metadata.json");
  }

  async listStoredSessions(): Promise<ListStoredSessionsResult> {
    const workspaceSessionRoots = await this.listWorkspaceSessionRoots();
    const sessions: StoredSessionSummary[] = [];

    for (const { workspaceId, sessionsRoot } of workspaceSessionRoots) {
      const sessionDirectoryEntries = await readdir(sessionsRoot, { withFileTypes: true }).catch(
        (error: unknown) => {
          if (isFileNotFoundError(error)) return [];
          throw error;
        },
      );

      for (const entry of sessionDirectoryEntries) {
        if (!entry.isDirectory()) continue;
        const sessionDirectory = path.join(sessionsRoot, entry.name);
        const metadataPath = path.join(sessionDirectory, "metadata.json");
        const metadataText = await readFile(metadataPath, "utf8").catch((error: unknown) => {
          if (isFileNotFoundError(error)) return undefined;
          throw error;
        });
        if (!metadataText) {
          continue;
        }

        const metadata = parseJsonObject(metadataText);
        if (!metadata) {
          continue;
        }

        const summary = await toStoredSessionSummary(metadata, sessionDirectory, workspaceId);
        if (summary) {
          sessions.push(summary);
        }
      }
    }

    sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return { sessions };
  }

  private async listWorkspaceSessionRoots(): Promise<
    Array<{ workspaceId: string; sessionsRoot: string }>
  > {
    const workspacesRoot = getOpenAcpWorkspacesRoot(this.homeRoot);
    const workspaceEntries = await readdir(workspacesRoot, { withFileTypes: true }).catch(
      (error: unknown) => {
        if (isFileNotFoundError(error)) return [];
        throw error;
      },
    );
    return workspaceEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const workspaceId = decodeURIComponent(entry.name);
        return {
          workspaceId,
          sessionsRoot: getOpenAcpWorkspaceSessionsRoot(workspaceId, this.homeRoot),
        };
      });
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

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

async function toStoredSessionSummary(
  metadata: Record<string, unknown>,
  sessionDirectory: string,
  workspaceId?: string,
): Promise<StoredSessionSummary | undefined> {
  const sessionId = readNonEmptyString(metadata.sessionId);
  const provider = readSmokeProvider(metadata.provider);
  const cwd = readNonEmptyString(metadata.cwd);
  if (!sessionId || !provider || !cwd) {
    return undefined;
  }

  return {
    sessionId,
    workspaceId,
    provider,
    title: readNonEmptyString(metadata.title),
    cwd,
    model: readNonEmptyString(metadata.model),
    mode: readNormalizedSessionMode(metadata.mode),
    createdAt: readNonEmptyString(metadata.createdAt) ?? readNonEmptyString(metadata.recordedAt),
    updatedAt:
      readNonEmptyString(metadata.recordedAt) ?? (await readDirectoryUpdatedAt(sessionDirectory)),
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readSmokeProvider(value: unknown): SmokeProvider | undefined {
  return typeof value === "string" && SMOKE_PROVIDERS.includes(value as SmokeProvider)
    ? (value as SmokeProvider)
    : undefined;
}

function readNormalizedSessionMode(value: unknown): NormalizedSessionMode | undefined {
  return value === "build" || value === "plan" ? value : undefined;
}

async function readDirectoryUpdatedAt(sessionDirectory: string): Promise<string> {
  return (await stat(sessionDirectory)).mtime.toISOString();
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
