import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  RecordedToolCallGalleryItem,
  ToolCallGalleryResponse,
  ToolCallGallerySession,
  ToolCallGalleryWarning,
} from "../shared/toolCallGallery.ts";

type JsonRecord = Record<string, unknown>;

interface ParsedSessionMetadata {
  provider?: string;
  cwd?: string;
  sessionId?: string;
}

interface ToolCallPayload {
  requestId?: string;
  provider?: string;
  sessionId?: string;
  cwd?: string;
  toolCallId?: string;
  toolTitle?: string;
  toolKind?: string;
  toolState?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  timestamp?: string;
}

export async function readRecordedToolCalls(cwd: string): Promise<ToolCallGalleryResponse> {
  const sessionsRoot = path.join(cwd, ".acp", "sessions");
  const sessionNames = await readdir(sessionsRoot).catch((error: unknown) => {
    if (isFileNotFoundError(error)) return [];
    throw error;
  });

  const warnings: ToolCallGalleryWarning[] = [];
  const sessions: ToolCallGallerySession[] = [];
  const toolCalls: RecordedToolCallGalleryItem[] = [];

  for (const sessionDirectoryName of sessionNames.sort((left, right) =>
    left.localeCompare(right),
  )) {
    const sessionDirectory = path.join(sessionsRoot, sessionDirectoryName);
    const metadata = await readMetadata(sessionDirectory, sessionDirectoryName, warnings);
    const sourcePath = path.join(sessionDirectory, "events.jsonl");
    const eventsText = await readFile(sourcePath, "utf8").catch((error: unknown) => {
      if (isFileNotFoundError(error)) return "";
      throw error;
    });
    const merged = new Map<string, RecordedToolCallGalleryItem>();
    let eventCount = 0;

    eventsText.split(/\r?\n/u).forEach((line, index) => {
      if (line.trim().length === 0) return;
      const parsed = parseJsonLine(line, {
        sessionId: metadata.sessionId ?? sessionDirectoryName,
        sourcePath,
        lineNumber: index + 1,
        warnings,
      });
      if (!parsed) return;
      eventCount += 1;
      const payload = getToolCallPayload(parsed);
      if (!payload?.toolCallId) return;

      const sessionId = payload.sessionId ?? metadata.sessionId ?? sessionDirectoryName;
      const key = `${sessionId}:${payload.toolCallId}`;
      merged.set(
        key,
        mergeToolCall(merged.get(key), payload, {
          sessionId,
          provider: payload.provider ?? metadata.provider,
          cwd: payload.cwd ?? metadata.cwd,
          sourcePath,
        }),
      );
    });

    const sessionToolCalls = [...merged.values()].sort(compareToolCalls);
    toolCalls.push(...sessionToolCalls);
    sessions.push({
      sessionId: metadata.sessionId ?? sessionDirectoryName,
      provider: metadata.provider,
      cwd: metadata.cwd,
      eventCount,
      toolCallCount: sessionToolCalls.length,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sessions,
    toolCalls: toolCalls.sort(compareToolCalls),
    warnings,
  };
}

async function readMetadata(
  sessionDirectory: string,
  fallbackSessionId: string,
  warnings: ToolCallGalleryWarning[],
): Promise<ParsedSessionMetadata> {
  const sourcePath = path.join(sessionDirectory, "metadata.json");
  const text = await readFile(sourcePath, "utf8").catch((error: unknown) => {
    if (isFileNotFoundError(error)) return "";
    throw error;
  });
  if (text.length === 0) return { sessionId: fallbackSessionId };

  try {
    const parsed = JSON.parse(text) as JsonRecord;
    return {
      provider: getString(parsed.provider),
      cwd: getString(parsed.cwd),
      sessionId: getString(parsed.sessionId) ?? fallbackSessionId,
    };
  } catch (error) {
    warnings.push({
      sessionId: fallbackSessionId,
      sourcePath,
      message:
        error instanceof Error
          ? `Invalid metadata JSON: ${error.message}`
          : "Invalid metadata JSON.",
    });
    return { sessionId: fallbackSessionId };
  }
}

function parseJsonLine(
  line: string,
  params: {
    sessionId: string;
    sourcePath: string;
    lineNumber: number;
    warnings: ToolCallGalleryWarning[];
  },
): JsonRecord | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch (error) {
    params.warnings.push({
      sessionId: params.sessionId,
      sourcePath: params.sourcePath,
      lineNumber: params.lineNumber,
      message:
        error instanceof Error ? `Invalid JSON line: ${error.message}` : "Invalid JSON line.",
    });
    return undefined;
  }
}

function getToolCallPayload(event: JsonRecord): ToolCallPayload | undefined {
  if (event.type !== "chatStreamEvent" || !isRecord(event.payload)) return undefined;
  const payload = event.payload;
  if (payload.kind !== "tool_call" && payload.kind !== "tool_call_update") return undefined;
  return {
    requestId: getString(payload.requestId),
    provider: getString(payload.provider),
    sessionId: getString(payload.sessionId),
    cwd: getString(payload.cwd),
    toolCallId: getString(payload.toolCallId),
    toolTitle: getString(payload.toolTitle),
    toolKind: getString(payload.toolKind),
    toolState: getString(payload.toolState),
    input: payload.input,
    output: payload.output,
    errorText: getString(payload.errorText),
    timestamp: getString(payload.timestamp),
  };
}

function mergeToolCall(
  current: RecordedToolCallGalleryItem | undefined,
  payload: ToolCallPayload,
  fallback: {
    sessionId: string;
    provider?: string;
    cwd?: string;
    sourcePath: string;
  },
): RecordedToolCallGalleryItem {
  const timestamp = payload.timestamp ?? current?.timestamp ?? new Date(0).toISOString();
  return {
    sessionId: fallback.sessionId,
    requestId: payload.requestId ?? current?.requestId,
    provider: payload.provider ?? current?.provider ?? fallback.provider,
    cwd: payload.cwd ?? current?.cwd ?? fallback.cwd,
    toolCallId: payload.toolCallId ?? current?.toolCallId ?? "unknown-tool-call",
    toolTitle: payload.toolTitle ?? current?.toolTitle,
    toolKind: payload.toolKind ?? current?.toolKind,
    toolState: payload.toolState ?? current?.toolState,
    input: payload.input ?? current?.input,
    output: payload.output ?? current?.output,
    errorText: payload.errorText ?? current?.errorText,
    firstTimestamp: current?.firstTimestamp ?? payload.timestamp ?? timestamp,
    timestamp,
    eventCount: (current?.eventCount ?? 0) + 1,
    sourcePath: fallback.sourcePath,
  };
}

function compareToolCalls(
  left: RecordedToolCallGalleryItem,
  right: RecordedToolCallGalleryItem,
): number {
  return (
    right.timestamp.localeCompare(left.timestamp) || left.toolCallId.localeCompare(right.toolCallId)
  );
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
