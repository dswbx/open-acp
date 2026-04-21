import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompactReasoning } from "../../src/mainview/components/CompactReasoning.tsx";
import { ChatSurface } from "../../src/mainview/components/ChatSurface.tsx";
import { CompactToolCall } from "../../src/mainview/components/CompactToolCall.tsx";
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

const messagesWithReasoningSteps: ChatMessage[] = [
  {
    id: "a2",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:02.000Z",
    status: "streaming",
    blocks: [
      {
        kind: "reasoning-steps",
        id: "rs-1",
        steps: [
          {
            id: "r1",
            summary: "Planning response",
            detail: "Checking the current state before replying",
            updateType: "analysis",
            timestamp: "2026-04-17T00:00:02.000Z",
          },
        ],
      },
    ],
  },
];

const messagesWithReasoningAndTool: ChatMessage[] = [
  {
    id: "a4",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:04.000Z",
    status: "streaming",
    blocks: [
      {
        kind: "reasoning",
        id: "r1",
        text: "I'll inspect the renderer first.",
        startedAt: "2026-04-17T00:00:01.000Z",
        endedAt: "2026-04-17T00:00:03.000Z",
      },
      {
        kind: "tool",
        id: "b-tool-2",
        tool: {
          toolCallId: "tool-2",
          title: "Read ChatSurface.tsx",
          state: "output-available",
          timestamp: "2026-04-17T00:00:04.000Z",
        },
      },
    ],
  },
];

const completedMessageWithReasoning: ChatMessage[] = [
  {
    id: "a5",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:05.000Z",
    status: "complete",
    blocks: [
      {
        kind: "reasoning",
        id: "r1",
        text: "I inspected the renderer first.",
        startedAt: "2026-04-17T00:00:01.000Z",
        endedAt: "2026-04-17T00:00:03.000Z",
      },
      { kind: "text", id: "t1", text: "Done." },
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
    blocks: [
      {
        kind: "tool",
        id: "b-tool-1",
        tool: {
          toolCallId: "tool-1",
          title: "Edited App.tsx",
          kind: "functions.apply_patch",
          state: "output-available",
          input: {
            patch: "*** Begin Patch\n*** Update File: src/mainview/App.tsx\n*** End Patch",
          },
          timestamp: "2026-04-17T00:00:03.000Z",
        },
      },
    ],
  },
];

describe("ChatSurface", () => {
  it("renders message text and a thinking indicator below streaming content", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messages} />);
    expect(html).toContain("hello");
    expect(html).toContain('aria-label="Loading"');
    expect(html).not.toContain("Streaming...");
  });

  it("keeps thought process collapsed by default and shimmers while streaming", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messagesWithReasoningSteps} />);

    expect(html).toContain("Thinking");
    expect(html).toContain("text-transparent");
    expect(html).not.toContain("Planning response");
    expect(html).not.toContain("Thought process");
  });

  it("renders compact tool rows in the chat surface", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messagesWithTool} />);

    expect(html).toContain("Edited App.tsx");
    expect(html).not.toContain("Awaiting Approval");
    expect(html).not.toContain("Completed");
    expect(html).not.toContain("…/src/mainview/App.tsx");
  });

  it("renders reasoning before tool calls when reasoning precedes the tool block", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messagesWithReasoningAndTool} />);

    expect(html).toContain("Thought for 2s");
    expect(html.indexOf("Thought for 2s")).toBeLessThan(html.indexOf("Read ChatSurface.tsx"));
  });

  it("labels completed reasoning with elapsed thinking copy", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={completedMessageWithReasoning} />);

    expect(html).toContain("Thought for 2s");
    expect(html).not.toContain("Thought process");
  });

  it("renders compact active reasoning rows with the thought text expandable", () => {
    const html = renderToStaticMarkup(
      <CompactReasoning
        defaultOpen
        isActive
        startedAt="2026-04-17T00:00:01.000Z"
        text="I am checking the files first."
      />,
    );

    expect(html).toContain("Thinking");
    expect(html).toContain("text-transparent");
    expect(html).toContain("I am checking the files first.");
    expect(html).not.toContain("Brain");
    expect(html).not.toContain("ChevronDown");
  });

  it("shimmers only the active tool verb", () => {
    const html = renderToStaticMarkup(
      <CompactToolCall
        tool={{
          toolCallId: "tool-1",
          title: "Reading package.json",
          shimmerPrefix: "Reading",
          state: "input-available",
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain("Reading");
    expect(html).toContain("package.json");
    expect(html).toContain("text-transparent");
    expect(html).not.toContain("Wrench");
    expect(html).not.toContain("leading-none");
    expect(html).not.toContain("text-xs");
    expect(html).not.toContain("ChevronDown");
  });

  it("preserves expandable tool payloads", () => {
    const html = renderToStaticMarkup(
      <CompactToolCall
        defaultOpen
        tool={{
          toolCallId: "tool-1",
          title: "Ran git status --short",
          state: "output-available",
          input: {
            cmd: "git status --short",
          },
          output: {
            stdout: "M src/mainview/App.tsx",
          },
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain("Ran git status --short");
    expect(html).toContain("Parameters");
    expect(html).toContain("git status --short");
    expect(html).toContain("M src/mainview/App.tsx");
  });
});
