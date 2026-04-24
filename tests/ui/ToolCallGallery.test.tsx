import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolCallGalleryView } from "../../src/mainview/features/tool-calls/ToolCallGallery.tsx";
import type { ToolCallGalleryResponse } from "../../src/shared/toolCallGallery.ts";

const response: ToolCallGalleryResponse = {
  generatedAt: "2026-04-24T09:02:00.000Z",
  sessions: [
    {
      sessionId: "session-a",
      provider: "codex",
      cwd: "/workspace/project",
      eventCount: 2,
      toolCallCount: 1,
      thinkingCount: 1,
      cancellationCount: 1,
    },
  ],
  toolCalls: [
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
      sourceEvents: [
        {
          type: "chatStreamEvent",
          lineNumber: 1,
          timestamp: "2026-04-24T09:00:02.000Z",
          payload: { kind: "tool_call_update", toolCallId: "tool-1" },
        },
      ],
    },
  ],
  thinking: [
    {
      sessionId: "session-a",
      requestId: "request-a",
      provider: "codex",
      cwd: "/workspace/project",
      text: "I should read the package file.",
      firstTimestamp: "2026-04-24T09:00:01.000Z",
      timestamp: "2026-04-24T09:00:01.000Z",
      eventCount: 1,
      sourcePath: "/workspace/project/.acp/sessions/session-a/events.jsonl",
      sourceEvents: [
        {
          type: "chatStreamEvent",
          lineNumber: 2,
          timestamp: "2026-04-24T09:00:01.000Z",
          payload: { kind: "agent_thought_chunk", text: "I should read the package file." },
        },
      ],
    },
  ],
  cancellations: [
    {
      sessionId: "session-a",
      requestId: "request-a",
      provider: "codex",
      cwd: "/workspace/project",
      reason: "cancelled",
      method: "agent_complete",
      timestamp: "2026-04-24T09:00:03.000Z",
      sourcePath: "/workspace/project/.acp/sessions/session-a/events.jsonl",
      sourceEvents: [
        {
          type: "chatStreamEvent",
          lineNumber: 3,
          timestamp: "2026-04-24T09:00:03.000Z",
          payload: { kind: "agent_complete", stopReason: "cancelled" },
        },
      ],
    },
  ],
  warnings: [],
};

describe("ToolCallGalleryView", () => {
  it("renders recorded tool calls and summary metadata", () => {
    const html = renderToStaticMarkup(<ToolCallGalleryView data={response} />);

    expect(html).toContain("Recorded activity");
    expect(html).toContain("Tool calls");
    expect(html).toContain("Other");
    expect(html).toContain("1 tool call");
    expect(html).toContain("2 other events");
    expect(html).toContain("1 session");
    expect(html).toContain("Read package.json");
    expect(html).toContain("codex");
    expect(html).toContain("Complete");
    expect(html).toContain("Payload");
  });

  it("renders an empty state when no calls are available", () => {
    const html = renderToStaticMarkup(
      <ToolCallGalleryView
        data={{
          generatedAt: response.generatedAt,
          sessions: [],
          toolCalls: [],
          thinking: [],
          cancellations: [],
          warnings: [],
        }}
      />,
    );

    expect(html).toContain("No recorded tool calls");
  });

  it("uses the chat background instead of card-backed tool rows", () => {
    const html = renderToStaticMarkup(<ToolCallGalleryView data={response} />);

    expect(html).toContain("bg-background");
    expect(html).not.toContain("bg-card");
  });
});
