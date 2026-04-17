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

const messagesWithReasoning: ChatMessage[] = [
  {
    id: "a2",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:02.000Z",
    status: "streaming",
    reasoningSteps: [
      {
        id: "r1",
        summary: "Planning response",
        detail: "Checking the current state before replying",
        updateType: "analysis",
      },
    ],
  },
];

describe("ChatSurface", () => {
  it("renders message text and a thinking indicator below streaming content", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messages} />);
    expect(html).toContain("hello");
    expect(html).toContain("Thinking");
    expect(html).not.toContain("Streaming...");
  });

  it("keeps thought process collapsed by default and shimmers while streaming", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messagesWithReasoning} />);

    expect(html).toContain("Thinking");
    expect(html).toContain("text-transparent");
    expect(html).not.toContain("Planning response");
    expect(html).not.toContain("Thought process");
  });
});
