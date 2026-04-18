import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SmokeProvider } from "../shared/AppRPC.ts";
import {
  createEmptyProviderModelCatalog,
  getSmokeProviderLabel,
} from "../shared/providerModels.ts";
import type {
  ReplayFixtureEventRecord,
  ReplayFixtureMetadata
} from "../shared/e2e.ts";

interface RawRecordingMetadata {
  provider?: SmokeProvider;
  cwd?: string;
  sessionId?: string;
  model?: string;
}

export interface ExportReplayFixtureParams {
  inputDirectory: string;
  outputDirectory: string;
  fixtureName: string;
  description?: string;
}

export interface ExportReplayFixtureResult {
  metadata: ReplayFixtureMetadata;
  events: ReplayFixtureEventRecord[];
}

function replaceAll(input: string, replacements: ReadonlyArray<[string, string]>): string {
  let value = input;
  for (const [from, to] of replacements) {
    if (from.length === 0) {
      continue;
    }
    value = value.split(from).join(to);
  }
  return value;
}

function sanitizeJsonValue(
  value: unknown,
  replacements: ReadonlyArray<[string, string]>,
  idMap: Map<string, string>
): unknown {
  if (typeof value === "string") {
    const mappedId = idMap.get(value);
    return replaceAll(mappedId ?? value, replacements);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry, replacements, idMap));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sanitizeJsonValue(entry, replacements, idMap)
      ])
    );
  }
  return value;
}

function collectStringIds(value: unknown, ids: Set<string>): void {
  if (typeof value === "string") {
    if (
      /^(session|request|approval|tool|entry|event|run)[-_:/]/i.test(value) ||
      /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)
    ) {
      ids.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStringIds(entry, ids);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectStringIds(entry, ids);
    }
  }
}

function buildStableIdMap(values: Iterable<string>): Map<string, string> {
  const prefixes = new Map<string, number>();
  const result = new Map<string, string>();

  for (const value of values) {
    const normalized = value.toLowerCase();
    const prefix =
      normalized.startsWith("session") ? "session" :
      normalized.startsWith("request") ? "request" :
      normalized.startsWith("approval") ? "approval" :
      normalized.startsWith("tool") ? "tool-call" :
      normalized.startsWith("entry") ? "entry" :
      normalized.startsWith("event") ? "event" :
      normalized.startsWith("run") ? "run" :
      "id";
    const nextCount = (prefixes.get(prefix) ?? 0) + 1;
    prefixes.set(prefix, nextCount);
    result.set(value, `${prefix}-${nextCount}`);
  }

  return result;
}

function sanitizeTimestampSequence(
  events: ReplayFixtureEventRecord[]
): ReplayFixtureEventRecord[] {
  let previousOriginalTimestamp: number | undefined;
  let previousSanitizedTimestamp = Date.parse("2026-01-01T00:00:00.000Z");

  return events.map((event, index) => {
    const payload = { ...event.payload } as { timestamp?: string };
    const originalTimestamp =
      typeof payload.timestamp === "string"
        ? Date.parse(payload.timestamp)
        : Number.NaN;
    const delayMs =
      index === 0 ||
      Number.isNaN(originalTimestamp) ||
      previousOriginalTimestamp == null
        ? 0
        : Math.max(0, Math.min(1500, originalTimestamp - previousOriginalTimestamp));
    previousOriginalTimestamp = Number.isNaN(originalTimestamp)
      ? previousOriginalTimestamp
      : originalTimestamp;
    previousSanitizedTimestamp += delayMs;
    payload.timestamp = new Date(previousSanitizedTimestamp).toISOString();
    return {
      ...event,
      delayMs,
      payload
    } as ReplayFixtureEventRecord;
  });
}

function inferProviderLabel(provider: SmokeProvider): string {
  return getSmokeProviderLabel(provider);
}

export async function exportReplayFixture(
  params: ExportReplayFixtureParams
): Promise<ExportReplayFixtureResult> {
  const metadataPath = path.join(params.inputDirectory, "metadata.json");
  const eventsPath = path.join(params.inputDirectory, "events.jsonl");
  const messagesPath = path.join(params.inputDirectory, "messages.jsonl");

  const [rawMetadataText, rawEventsText, rawMessagesText] = await Promise.all([
    readFile(metadataPath, "utf8"),
    readFile(eventsPath, "utf8"),
    readFile(messagesPath, "utf8").catch(() => "")
  ]);

  const rawMetadata = JSON.parse(rawMetadataText) as RawRecordingMetadata;
  const rawEvents = rawEventsText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ReplayFixtureEventRecord);

  const discoveredIds = new Set<string>();
  collectStringIds(rawMetadata, discoveredIds);
  collectStringIds(rawEvents, discoveredIds);
  const stableIdMap = buildStableIdMap(discoveredIds);

  const rawCwd = rawMetadata.cwd?.trim() || "/Users/example/project";
  const sanitizedCwd = "/workspace/project";
  const replacements: Array<[string, string]> = [
    [rawCwd, sanitizedCwd],
    [os.homedir(), "/workspace/home"]
  ];

  const sanitizedMetadataValue = sanitizeJsonValue(
    rawMetadata,
    replacements,
    stableIdMap
  ) as RawRecordingMetadata;
  const sanitizedSessionId =
    sanitizedMetadataValue.sessionId?.trim() || "session-1";
  const provider = sanitizedMetadataValue.provider ?? "codex";
  const model =
    sanitizedMetadataValue.model?.trim() ||
    (rawMessagesText
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { payload?: { model?: string } })
      .find((entry) => typeof entry.payload?.model === "string")
      ?.payload?.model ?? "default");

  const sanitizedEvents = sanitizeTimestampSequence(
    rawEvents.map(
      (event) =>
        sanitizeJsonValue(event, replacements, stableIdMap) as ReplayFixtureEventRecord
    )
  );

  const firstRequestId = sanitizedEvents.find(
    (event) => event.type === "chatStreamEvent"
  )?.payload.requestId;
  const userMessage =
    rawMessagesText
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { type?: string; payload?: { text?: string } })
      .find((entry) => entry.type === "user_message")
      ?.payload?.text ?? "Replay this recorded session.";

  const fixtureMetadata: ReplayFixtureMetadata = {
    schemaVersion: 1,
    fixtureName: params.fixtureName,
    description: params.description,
    homeDirectory: "/workspace",
    sessions: [
      {
        sessionId: sanitizedSessionId,
        provider,
        cwd: sanitizedMetadataValue.cwd?.trim() || sanitizedCwd,
        title: `${inferProviderLabel(provider)} ${sanitizedSessionId.slice(0, 8)}`,
        model
      }
    ],
    providerModelCatalogs: {
      [provider]: createEmptyProviderModelCatalog(provider)
    },
    directoryEntriesByCwd: {
      [sanitizedMetadataValue.cwd?.trim() || sanitizedCwd]: []
    },
    gitStatusesByCwd: {
      [sanitizedMetadataValue.cwd?.trim() || sanitizedCwd]: {
        cwd: sanitizedMetadataValue.cwd?.trim() || sanitizedCwd,
        isGitRepository: false,
        summary: {
          staged: 0,
          unstaged: 0,
          untracked: 0,
          conflicted: 0,
          added: 0,
          modified: 0,
          deleted: 0,
          renamed: 0,
          copied: 0,
          typeChanged: 0
        },
        files: []
      }
    },
    actions: firstRequestId
      ? [
          {
            actionId: "send-message-1",
            type: "sendChatMessage",
            provider,
            sessionId: sanitizedSessionId,
            cwd: sanitizedMetadataValue.cwd?.trim() || sanitizedCwd,
            message: userMessage,
            model,
            result: {
              requestId: firstRequestId,
              provider,
              sessionId: sanitizedSessionId,
              cwd: sanitizedMetadataValue.cwd?.trim() || sanitizedCwd,
              model
            },
            phases: [
              {
                kind: "emit",
                startEventIndex: 0,
                endEventIndex: sanitizedEvents.length
              }
            ]
          }
        ]
      : []
  };

  const sanitizedMessages = rawMessagesText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) =>
      JSON.stringify(sanitizeJsonValue(JSON.parse(line), replacements, stableIdMap))
    )
    .join("\n");

  await mkdir(params.outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(params.outputDirectory, "metadata.json"),
      `${JSON.stringify(fixtureMetadata, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      path.join(params.outputDirectory, "events.jsonl"),
      `${sanitizedEvents.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8"
    ),
    sanitizedMessages.length > 0
      ? writeFile(
          path.join(params.outputDirectory, "messages.jsonl"),
          `${sanitizedMessages}\n`,
          "utf8"
        )
      : Promise.resolve()
  ]);

  return {
    metadata: fixtureMetadata,
    events: sanitizedEvents
  };
}
