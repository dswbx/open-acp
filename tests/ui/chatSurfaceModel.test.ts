import { describe, expect, it } from "vitest";
import {
  mapChatMessagesToSurface,
  toChatSurfaceItem,
} from "../../src/mainview/chat/chatSurfaceModel.ts";
import type { ChatMessage } from "../../src/mainview/chat/types.ts";

const base: ChatMessage = {
  id: "m-1",
  author: "assistant",
  provider: "codex",
  text: "",
  timestamp: "2026-04-17T00:00:00.000Z",
  status: "streaming",
};

describe("chatSurfaceModel", () => {
  it("preserves empty streaming content and leaves the status separate", () => {
    const item = toChatSurfaceItem(base);
    expect(item.text).toBe("");
    expect(item.isStreaming).toBe(true);
    expect(item.blocks).toEqual([]);
    expect(item.showFallbackThinking).toBe(true);
  });

  it("maps reasoning blocks as their own surface entries", () => {
    const item = toChatSurfaceItem({
      ...base,
      blocks: [{ kind: "reasoning", id: "r1", text: "I am checking the files first." }],
    });

    expect(item.blocks).toEqual([
      {
        kind: "reasoning",
        id: "r1",
        text: "I am checking the files first.",
        isActive: true,
      },
    ]);
    expect(item.showFallbackThinking).toBe(false);
  });

  it("preserves the order of reasoning, tool, and text blocks", () => {
    const item = toChatSurfaceItem({
      ...base,
      blocks: [
        { kind: "reasoning", id: "r1", text: "Planning." },
        {
          kind: "tool",
          id: "b1",
          tool: {
            toolCallId: "t1",
            title: "Run ls",
            state: "output-available",
            timestamp: "2026-04-17T00:00:00.000Z",
          },
        },
        { kind: "text", id: "t1", text: "Here is the result." },
      ],
    });

    expect(item.blocks.map((block) => block.kind)).toEqual(["reasoning", "tool", "text"]);
    expect(item.showFallbackThinking).toBe(false);
  });

  it("only marks the trailing reasoning block as active while streaming", () => {
    const item = toChatSurfaceItem({
      ...base,
      blocks: [
        { kind: "reasoning", id: "r1", text: "First thought." },
        { kind: "text", id: "t1", text: "Intermediate answer." },
        { kind: "reasoning", id: "r2", text: "Second thought." },
      ],
    });

    const reasoningBlocks = item.blocks.filter((block) => block.kind === "reasoning");
    expect(reasoningBlocks).toHaveLength(2);
    expect(reasoningBlocks[0]).toMatchObject({ id: "r1", isActive: false });
    expect(reasoningBlocks[1]).toMatchObject({ id: "r2", isActive: true });
  });

  it("marks error rows", () => {
    const item = toChatSurfaceItem({ ...base, status: "error", text: "boom" });
    expect(item.isError).toBe(true);
    expect(item.isStreaming).toBe(false);
  });

  it("maps arrays while preserving id order", () => {
    const items = mapChatMessagesToSurface([
      { ...base, id: "1", text: "a", status: "complete" },
      { ...base, id: "2", text: "b", status: "complete" },
    ]);
    expect(items.map((item) => item.id)).toEqual(["1", "2"]);
  });
});
