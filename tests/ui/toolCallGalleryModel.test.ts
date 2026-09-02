import { describe, expect, it } from "vitest";
import {
  buildToolCallGalleryFilters,
  filterToolCallGalleryItems,
  getToolCallDisplayState,
  groupToolCallGalleryItems,
  toChatToolCall,
} from "../../src/mainview/features/tool-calls/toolCallGalleryModel.ts";
import type { RecordedToolCallGalleryItem } from "../../src/shared/toolCallGallery.ts";

const items: RecordedToolCallGalleryItem[] = [
  {
    sessionId: "session-a",
    requestId: "request-a",
    provider: "codex",
    cwd: "/workspace/project",
    toolCallId: "tool-1",
    toolTitle: "Read package.json",
    toolKind: "read",
    toolState: "output-available",
    input: { file_path: "/workspace/project/package.json" },
    output: "ok",
    firstTimestamp: "2026-04-24T09:00:00.000Z",
    timestamp: "2026-04-24T09:00:02.000Z",
    eventCount: 2,
    sourcePath: "/workspace/project/.acp/sessions/session-a/events.jsonl",
    sourceEvents: [],
  },
  {
    sessionId: "session-b",
    provider: "qwen",
    cwd: "/workspace/project",
    toolCallId: "tool-2",
    toolKind: "search",
    toolState: "input-streaming",
    timestamp: "2026-04-24T09:00:03.000Z",
    eventCount: 1,
    sourcePath: "/workspace/project/.acp/sessions/session-b/events.jsonl",
    sourceEvents: [],
  },
];

describe("toolCallGalleryModel", () => {
  it("builds sorted filter options from recorded items", () => {
    expect(buildToolCallGalleryFilters(items)).toEqual({
      providers: ["codex", "qwen"],
      sessions: ["session-a", "session-b"],
      kinds: ["read", "search"],
      states: ["complete", "in-progress"],
    });
  });

  it("filters by provider, session, kind, display state, and text query", () => {
    expect(
      filterToolCallGalleryItems(items, {
        provider: "codex",
        sessionId: "all",
        kind: "read",
        state: "complete",
        query: "package",
      }).map((item) => item.toolCallId),
    ).toEqual(["tool-1"]);
  });

  it("derives display state and groups by tool kind", () => {
    expect(getToolCallDisplayState(items[1])).toBe("in-progress");
    expect(
      getToolCallDisplayState({
        ...items[0],
        toolCallId: "tool-cancelled",
        output: { status: "cancelled" },
      }),
    ).toBe("cancelled");
    expect(groupToolCallGalleryItems(items, "kind")).toEqual([
      { key: "read", label: "read", items: [items[0]] },
      { key: "search", label: "search", items: [items[1]] },
    ]);
  });

  it("converts recorded items into ChatToolCall values with presentation titles", () => {
    expect(toChatToolCall(items[0])).toMatchObject({
      toolCallId: "tool-1",
      title: "Read package.json",
      kind: "read",
      state: "output-available",
      input: { file_path: "/workspace/project/package.json" },
      output: "ok",
      timestamp: "2026-04-24T09:00:02.000Z",
    });
  });

  it("converts recorded file changes into rich ChatToolCall values", () => {
    expect(
      toChatToolCall({
        sessionId: "session-a",
        requestId: "request-a",
        provider: "codex",
        cwd: "/workspace/project",
        toolCallId: "tool-file",
        toolTitle: "File change",
        toolKind: "file_change",
        toolState: "output-available",
        output: {
          type: "fileChange",
          changes: [
            {
              path: "/workspace/project/test.txt",
              kind: { type: "delete" },
              diff: "hello world\n",
            },
          ],
          status: "completed",
        },
        timestamp: "2026-04-24T09:00:02.000Z",
        eventCount: 2,
        sourcePath: "/workspace/project/.acp/sessions/session-a/events.jsonl",
        sourceEvents: [],
      }),
    ).toMatchObject({
      toolCallId: "tool-file",
      title: "Deleted test.txt +0 -1",
      kind: "file_change",
      state: "output-available",
      fileChange: {
        verb: "Deleted",
        target: "test.txt",
        additions: 0,
        deletions: 1,
      },
    });
  });
});
