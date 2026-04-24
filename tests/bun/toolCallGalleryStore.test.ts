import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRecordedToolCalls } from "../../src/bun/toolCallGalleryStore.ts";

async function createSession(
  root: string,
  sessionId: string,
  params: {
    metadata?: Record<string, unknown>;
    eventLines: string[];
  },
): Promise<void> {
  const sessionDir = path.join(root, ".acp", "sessions", sessionId);
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
    await createSession(root, "session-a", {
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
      ],
    });

    const result = await readRecordedToolCalls(root);

    expect(result.sessions).toEqual([
      {
        sessionId: "session-a",
        provider: "codex",
        cwd: "/workspace/project",
        eventCount: 2,
        toolCallCount: 1,
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
      sourcePath: path.join(root, ".acp", "sessions", "session-a", "events.jsonl"),
    });
    expect(result.warnings).toEqual([]);
  });

  it("returns an empty result when .acp sessions are absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-empty-"));

    await expect(readRecordedToolCalls(root)).resolves.toEqual({
      generatedAt: expect.any(String),
      sessions: [],
      toolCalls: [],
      warnings: [],
    });
  });

  it("skips malformed JSON lines and keeps unknown provider data readable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tool-gallery-warning-"));
    await createSession(root, "session-b", {
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

    const result = await readRecordedToolCalls(root);

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
      path.join(root, ".acp", "sessions", "session-b", "events.jsonl"),
      "utf8",
    );
    expect(eventText).toContain("tool_call_update");
  });
});
