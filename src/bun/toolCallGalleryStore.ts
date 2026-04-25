import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  RecordedActivitySourceEvent,
  RecordedCancellationGalleryItem,
  RecordedThinkingGalleryItem,
  RecordedToolCallGalleryItem,
  ToolCallGalleryResponse,
  ToolCallGallerySession,
  ToolCallGalleryWarning,
} from "../shared/toolCallGallery.ts";
import { getOpenAcpSessionsRoot } from "./openAcpHome.ts";

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

interface ThinkingPayload {
  requestId?: string;
  provider?: string;
  sessionId?: string;
  cwd?: string;
  text?: string;
  timestamp?: string;
}

interface CancellationPayload {
  requestId?: string;
  provider?: string;
  sessionId?: string;
  cwd?: string;
  reason?: string;
  method?: string;
  direction?: string;
  timestamp?: string;
}

export async function readRecordedToolCalls(homeRoot?: string): Promise<ToolCallGalleryResponse> {
  const sessionsRoot = getOpenAcpSessionsRoot(homeRoot);
  const sessionNames = await readdir(sessionsRoot).catch((error: unknown) => {
    if (isFileNotFoundError(error)) return [];
    throw error;
  });

  const warnings: ToolCallGalleryWarning[] = [];
  const sessions: ToolCallGallerySession[] = [];
  const toolCalls: RecordedToolCallGalleryItem[] = [];
  const thinking: RecordedThinkingGalleryItem[] = [];
  const cancellations: RecordedCancellationGalleryItem[] = [];

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
    const mergedThinking = new Map<string, RecordedThinkingGalleryItem>();
    const sessionCancellations: RecordedCancellationGalleryItem[] = [];
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
      const sourceEvent = toSourceEvent(parsed, index + 1);
      const payload = getToolCallPayload(parsed);
      if (payload?.toolCallId) {
        const sessionId = payload.sessionId ?? metadata.sessionId ?? sessionDirectoryName;
        const key = `${sessionId}:${payload.toolCallId}`;
        merged.set(
          key,
          mergeToolCall(merged.get(key), payload, {
            sessionId,
            provider: payload.provider ?? metadata.provider,
            cwd: payload.cwd ?? metadata.cwd,
            sourcePath,
            sourceEvent,
          }),
        );
      }

      const thinkingPayload = getThinkingPayload(parsed);
      if (thinkingPayload?.text) {
        const sessionId = thinkingPayload.sessionId ?? metadata.sessionId ?? sessionDirectoryName;
        const requestId = thinkingPayload.requestId ?? "unknown-request";
        const key = `${sessionId}:${requestId}`;
        mergedThinking.set(
          key,
          mergeThinking(mergedThinking.get(key), thinkingPayload, {
            sessionId,
            provider: thinkingPayload.provider ?? metadata.provider,
            cwd: thinkingPayload.cwd ?? metadata.cwd,
            sourcePath,
            sourceEvent,
          }),
        );
      }

      const cancellationPayload = getCancellationPayload(parsed);
      if (cancellationPayload) {
        sessionCancellations.push(
          toCancellation(cancellationPayload, {
            sessionId: cancellationPayload.sessionId ?? metadata.sessionId ?? sessionDirectoryName,
            provider: cancellationPayload.provider ?? metadata.provider,
            cwd: cancellationPayload.cwd ?? metadata.cwd,
            sourcePath,
            sourceEvent,
          }),
        );
      }
    });

    const sessionToolCalls = [...merged.values()].sort(compareToolCalls);
    const sessionThinking = [...mergedThinking.values()].sort(compareThinking);
    sessionCancellations.sort(compareCancellations);
    toolCalls.push(...sessionToolCalls);
    thinking.push(...sessionThinking);
    cancellations.push(...sessionCancellations);
    sessions.push({
      sessionId: metadata.sessionId ?? sessionDirectoryName,
      provider: metadata.provider,
      cwd: metadata.cwd,
      eventCount,
      toolCallCount: sessionToolCalls.length,
      thinkingCount: sessionThinking.length,
      cancellationCount: sessionCancellations.length,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sessions,
    toolCalls: toolCalls.sort(compareToolCalls),
    thinking: thinking.sort(compareThinking),
    cancellations: cancellations.sort(compareCancellations),
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

function getThinkingPayload(event: JsonRecord): ThinkingPayload | undefined {
  if (event.type !== "chatStreamEvent" || !isRecord(event.payload)) return undefined;
  const payload = event.payload;
  if (payload.kind !== "agent_thought_chunk") return undefined;
  return {
    requestId: getString(payload.requestId),
    provider: getString(payload.provider),
    sessionId: getString(payload.sessionId),
    cwd: getString(payload.cwd),
    text: getString(payload.text),
    timestamp: getString(payload.timestamp),
  };
}

function getCancellationPayload(event: JsonRecord): CancellationPayload | undefined {
  if (event.type === "chatStreamEvent" && isRecord(event.payload)) {
    const payload = event.payload;
    if (payload.kind !== "agent_complete" || getString(payload.stopReason) !== "cancelled") {
      return undefined;
    }
    return {
      requestId: getString(payload.requestId),
      provider: getString(payload.provider),
      sessionId: getString(payload.sessionId),
      cwd: getString(payload.cwd),
      reason: getString(payload.stopReason),
      method: "agent_complete",
      timestamp: getString(payload.timestamp),
    };
  }

  if (event.type === "agentTranscriptEvent" && isRecord(event.payload)) {
    const payload = event.payload;
    if (getString(payload.method) !== "session/cancel") return undefined;
    return {
      provider: getString(payload.provider),
      sessionId: getString(payload.sessionId),
      method: getString(payload.method),
      direction: getString(payload.direction),
      timestamp: getString(payload.timestamp),
    };
  }

  return undefined;
}

function mergeToolCall(
  current: RecordedToolCallGalleryItem | undefined,
  payload: ToolCallPayload,
  fallback: {
    sessionId: string;
    provider?: string;
    cwd?: string;
    sourcePath: string;
    sourceEvent: RecordedActivitySourceEvent;
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
    sourceEvents: [...(current?.sourceEvents ?? []), fallback.sourceEvent],
  };
}

function mergeThinking(
  current: RecordedThinkingGalleryItem | undefined,
  payload: ThinkingPayload,
  fallback: {
    sessionId: string;
    provider?: string;
    cwd?: string;
    sourcePath: string;
    sourceEvent: RecordedActivitySourceEvent;
  },
): RecordedThinkingGalleryItem {
  const timestamp = payload.timestamp ?? current?.timestamp ?? new Date(0).toISOString();
  return {
    sessionId: fallback.sessionId,
    requestId: payload.requestId ?? current?.requestId,
    provider: payload.provider ?? current?.provider ?? fallback.provider,
    cwd: payload.cwd ?? current?.cwd ?? fallback.cwd,
    text: `${current?.text ?? ""}${payload.text ?? ""}`,
    firstTimestamp: current?.firstTimestamp ?? payload.timestamp ?? timestamp,
    timestamp,
    eventCount: (current?.eventCount ?? 0) + 1,
    sourcePath: fallback.sourcePath,
    sourceEvents: [...(current?.sourceEvents ?? []), fallback.sourceEvent],
  };
}

function toCancellation(
  payload: CancellationPayload,
  fallback: {
    sessionId: string;
    provider?: string;
    cwd?: string;
    sourcePath: string;
    sourceEvent: RecordedActivitySourceEvent;
  },
): RecordedCancellationGalleryItem {
  return {
    sessionId: fallback.sessionId,
    requestId: payload.requestId,
    provider: payload.provider ?? fallback.provider,
    cwd: payload.cwd ?? fallback.cwd,
    reason: payload.reason,
    method: payload.method,
    direction: payload.direction,
    timestamp: payload.timestamp ?? new Date(0).toISOString(),
    sourcePath: fallback.sourcePath,
    sourceEvents: [fallback.sourceEvent],
  };
}

function toSourceEvent(event: JsonRecord, lineNumber: number): RecordedActivitySourceEvent {
  const payload = isRecord(event.payload) ? event.payload : undefined;
  return {
    type: getString(event.type) ?? "unknown",
    lineNumber,
    timestamp: payload ? getString(payload.timestamp) : undefined,
    payload: payload ?? event,
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

function compareThinking(
  left: RecordedThinkingGalleryItem,
  right: RecordedThinkingGalleryItem,
): number {
  return (
    right.timestamp.localeCompare(left.timestamp) ||
    left.sessionId.localeCompare(right.sessionId) ||
    (left.requestId ?? "").localeCompare(right.requestId ?? "")
  );
}

function compareCancellations(
  left: RecordedCancellationGalleryItem,
  right: RecordedCancellationGalleryItem,
): number {
  return (
    right.timestamp.localeCompare(left.timestamp) ||
    left.sessionId.localeCompare(right.sessionId) ||
    (left.requestId ?? "").localeCompare(right.requestId ?? "")
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
