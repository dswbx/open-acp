import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tool, ToolHeader } from "../../src/components/ai-elements/tool.tsx";
import { ChatSurface } from "../../src/mainview/components/ChatSurface.tsx";
import type { ChatMessage } from "../../src/mainview/chat/types.ts";

const messages: ChatMessage[] = [
  {
    id: "u1",
    author: "user",
    provider: "codex",
    text: "hello",
    timestamp: "2026-04-17T00:00:00.000Z",
    status: "complete",
  },
  {
    id: "a1",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:01.000Z",
    status: "streaming",
  },
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

const messagesWithTool: ChatMessage[] = [
  {
    id: "a3",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:03.000Z",
    status: "complete",
    tools: [
      {
        toolCallId: "tool-1",
        title: "Edit App.tsx",
        subtitle: "…/src/mainview/App.tsx",
        kind: "functions.apply_patch",
        state: "output-available",
        timestamp: "2026-04-17T00:00:03.000Z",
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

  it("renders tool subtitles in the chat surface", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messagesWithTool} />);

    expect(html).toContain("Edit App.tsx");
    expect(html).toContain("…/src/mainview/App.tsx");
  });

  it("renders left-aligned wrapping tool headers", () => {
    const html = renderToStaticMarkup(
      <Tool defaultOpen={false}>
        <ToolHeader
          state="output-available"
          subtitle="…/src/mainview/App.tsx"
          title="Edit App.tsx"
          toolName="Edit App.tsx"
          type="dynamic-tool"
        />
      </Tool>,
    );

    expect(html).toContain("items-start justify-between gap-4 p-3 text-left");
    expect(html).toContain("min-w-0 flex-1 items-start gap-2 text-left");
    expect(html).toContain("whitespace-normal break-words font-medium text-sm");
  });
});
