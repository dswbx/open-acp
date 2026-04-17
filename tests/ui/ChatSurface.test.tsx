import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatSurface } from "../../src/mainview/components/ChatSurface.tsx";
import type { ChatMessage } from "../../src/mainview/chat/types.ts";

const messages: ChatMessage[] = [
  {
    id: "u1",
    author: "user",
    provider: "codex",
    text: "hello",
    timestamp: "2026-04-17T00:00:00.000Z",
    status: "complete"
  },
  {
    id: "a1",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:01.000Z",
    status: "streaming"
  }
];

describe("ChatSurface", () => {
  it("renders message text and a thinking indicator below streaming content", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messages} />);
    expect(html).toContain("hello");
    expect(html).toContain("Thinking");
    expect(html).not.toContain("Streaming...");
  });
});
