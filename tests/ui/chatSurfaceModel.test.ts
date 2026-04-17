import { describe, expect, it } from "vitest";
import {
  mapChatMessagesToSurface,
  toChatSurfaceItem
} from "../../src/mainview/chat/chatSurfaceModel.ts";
import type { ChatMessage } from "../../src/mainview/chat/types.ts";

const base: ChatMessage = {
  id: "m-1",
  author: "assistant",
  provider: "codex",
  text: "",
  timestamp: "2026-04-17T00:00:00.000Z",
  status: "streaming"
};

describe("chatSurfaceModel", () => {
  it("maps empty streaming content to placeholder text", () => {
    expect(toChatSurfaceItem(base).text).toBe("Streaming...");
  });

  it("marks error rows", () => {
    const item = toChatSurfaceItem({ ...base, status: "error", text: "boom" });
    expect(item.isError).toBe(true);
    expect(item.isStreaming).toBe(false);
  });

  it("maps arrays while preserving id order", () => {
    const items = mapChatMessagesToSurface([
      { ...base, id: "1", text: "a", status: "complete" },
      { ...base, id: "2", text: "b", status: "complete" }
    ]);
    expect(items.map((item) => item.id)).toEqual(["1", "2"]);
  });
});
