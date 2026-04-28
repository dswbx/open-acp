import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRecordedToolCalls } from "../../src/bun/toolCallGalleryStore.ts";

async function createSession(
  homeRoot: string,
  sessionId: string,
  params: {
    metadata?: Record<string, unknown>;
    eventLines: string[];
  },
): Promise<void> {
  const sessionDir = path.join(homeRoot, "sessions", sessionId);
  await mkdir(sessionDir, { recursive: true });
  if (params.metadata) {
    await writeFile(
      path.join(sessionDir, "metadata.json"),
      JSON.stringify(params.metadata),
      "utf8",
    );
  }
  await writeFile(
    path.join(sessionDir, "events.jsonl"),
    `${params.eventLines.join("\n")}\n`,
    "utf8",
  );
}

describe("readRecordedToolCalls", () => {
  it("merges tool call updates while preserving input from the first event", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-"));
    const homeRoot = path.join(root, ".open-acp");
    await createSession(homeRoot, "session-a", {
      metadata: {
        provider: "codex",
        cwd: "/workspace/project",
        sessionId: "session-a",
      },
      eventLines: [
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "tool_call",
            requestId: "request-a",
            provider: "codex",
            sessionId: "session-a",
            cwd: "/workspace/project",
            toolCallId: "tool-1",
            toolTitle: "Read package.json",
            toolKind: "read",
            toolState: "input-available",
            input: { file_path: "/workspace/project/package.json" },
            timestamp: "2026-04-24T09:00:00.000Z",
          },
        }),
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "tool_call_update",
            requestId: "request-a",
            provider: "codex",
            sessionId: "session-a",
            cwd: "/workspace/project",
            toolCallId: "tool-1",
            toolState: "output-available",
            output: '{ "name": "open-acp" }',
            timestamp: "2026-04-24T09:00:02.000Z",
          },
        }),
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "agent_thought_chunk",
            requestId: "request-a",
            provider: "codex",
            sessionId: "session-a",
            cwd: "/workspace/project",
            text: "I should inspect the package file.",
            timestamp: "2026-04-24T09:00:03.000Z",
          },
        }),
      ],
    });

    const result = await readRecordedToolCalls(homeRoot);

    expect(result.sessions).toEqual([
      {
        sessionId: "session-a",
        provider: "codex",
        cwd: "/workspace/project",
        eventCount: 3,
        toolCallCount: 1,
        thinkingCount: 1,
        cancellationCount: 0,
      },
    ]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      sessionId: "session-a",
      requestId: "request-a",
      provider: "codex",
      cwd: "/workspace/project",
      toolCallId: "tool-1",
      toolTitle: "Read package.json",
      toolKind: "read",
      toolState: "output-available",
      input: { file_path: "/workspace/project/package.json" },
      output: '{ "name": "open-acp" }',
      firstTimestamp: "2026-04-24T09:00:00.000Z",
      timestamp: "2026-04-24T09:00:02.000Z",
      eventCount: 2,
      sourcePath: path.join(homeRoot, "sessions", "session-a", "events.jsonl"),
    });
    expect(result.thinking).toEqual([
      expect.objectContaining({
        sessionId: "session-a",
        requestId: "request-a",
        provider: "codex",
        cwd: "/workspace/project",
        text: "I should inspect the package file.",
        firstTimestamp: "2026-04-24T09:00:03.000Z",
        timestamp: "2026-04-24T09:00:03.000Z",
        eventCount: 1,
      }),
    ]);
    expect(result.cancellations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns an empty result when .open-acp sessions are absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-empty-"));
    const homeRoot = path.join(root, ".open-acp");

    await expect(readRecordedToolCalls(homeRoot)).resolves.toEqual({
      generatedAt: expect.any(String),
      sessions: [],
      toolCalls: [],
      thinking: [],
      cancellations: [],
      warnings: [],
    });
  });

  it("skips malformed JSON lines and keeps unknown provider data readable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-warning-"));
    const homeRoot = path.join(root, ".open-acp");
    await createSession(homeRoot, "session-b", {
      metadata: {
        provider: "provider-x",
        cwd: "/workspace/other",
      },
      eventLines: [
        "{not-json",
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "tool_call_update",
            sessionId: "session-b",
            toolCallId: "tool-2",
            toolState: "output-error",
            errorText: "failed",
            timestamp: "2026-04-24T09:01:00.000Z",
          },
        }),
      ],
    });

    const result = await readRecordedToolCalls(homeRoot);

    expect(result.toolCalls[0]).toMatchObject({
      sessionId: "session-b",
      provider: "provider-x",
      cwd: "/workspace/other",
      toolCallId: "tool-2",
      toolState: "output-error",
      errorText: "failed",
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        sessionId: "session-b",
        lineNumber: 1,
        message: expect.stringContaining("Invalid JSON"),
      }),
    ]);

    const eventText = await readFile(
      path.join(homeRoot, "sessions", "session-b", "events.jsonl"),
      "utf8",
    );
    expect(eventText).toContain("tool_call_update");
  });

  it("records thinking chunks and cancellation activity from normalized events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-activity-"));
    const homeRoot = path.join(root, ".open-acp");
    await createSession(homeRoot, "session-c", {
      metadata: {
        provider: "codex",
        cwd: "/workspace/project",
      },
      eventLines: [
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "agent_thought_chunk",
            requestId: "request-c",
            provider: "codex",
            sessionId: "session-c",
            cwd: "/workspace/project",
            text: "First chunk. ",
            timestamp: "2026-04-24T09:02:00.000Z",
          },
        }),
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "agent_thought_chunk",
            requestId: "request-c",
            provider: "codex",
            sessionId: "session-c",
            cwd: "/workspace/project",
            text: "Second chunk.",
            timestamp: "2026-04-24T09:02:01.000Z",
          },
        }),
        JSON.stringify({
          type: "agentTranscriptEvent",
          payload: {
            provider: "codex",
            sessionId: "session-c",
            direction: "outgoing",
            method: "session/cancel",
            timestamp: "2026-04-24T09:02:02.000Z",
          },
        }),
        JSON.stringify({
          type: "chatStreamEvent",
          payload: {
            kind: "agent_complete",
            requestId: "request-c",
            provider: "codex",
            sessionId: "session-c",
            cwd: "/workspace/project",
            stopReason: "cancelled",
            timestamp: "2026-04-24T09:02:03.000Z",
          },
        }),
      ],
    });

    const result = await readRecordedToolCalls(homeRoot);

    expect(result.sessions[0]).toMatchObject({
      sessionId: "session-c",
      eventCount: 4,
      toolCallCount: 0,
      thinkingCount: 1,
      cancellationCount: 2,
    });
    expect(result.thinking).toEqual([
      expect.objectContaining({
        sessionId: "session-c",
        requestId: "request-c",
        text: "First chunk. Second chunk.",
        firstTimestamp: "2026-04-24T09:02:00.000Z",
        timestamp: "2026-04-24T09:02:01.000Z",
        eventCount: 2,
      }),
    ]);
    expect(result.cancellations).toEqual([
      expect.objectContaining({
        sessionId: "session-c",
        requestId: "request-c",
        reason: "cancelled",
        method: "agent_complete",
      }),
      expect.objectContaining({
        sessionId: "session-c",
        method: "session/cancel",
        direction: "outgoing",
      }),
    ]);
  });
});
