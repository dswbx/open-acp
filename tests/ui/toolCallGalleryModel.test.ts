import { describe, expect, it } from "vitest";
import {
  buildToolCallGalleryFilters,
  filterToolCallGalleryItems,
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
  },
];

describe("toolCallGalleryModel", () => {
  it("builds sorted filter options from recorded items", () => {
    expect(buildToolCallGalleryFilters(items)).toEqual({
      providers: ["codex", "qwen"],
      sessions: ["session-a", "session-b"],
      kinds: ["read", "search"],
      states: ["input-streaming", "output-available"],
    });
  });

  it("filters by provider, session, kind, state, and text query", () => {
    expect(
      filterToolCallGalleryItems(items, {
        provider: "codex",
        sessionId: "all",
        kind: "read",
        state: "output-available",
        query: "package",
      }).map((item) => item.toolCallId),
    ).toEqual(["tool-1"]);
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
});
