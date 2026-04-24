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
    },
  ],
  warnings: [],
};

describe("ToolCallGalleryView", () => {
  it("renders recorded tool calls and summary metadata", () => {
    const html = renderToStaticMarkup(<ToolCallGalleryView data={response} />);

    expect(html).toContain("Tool calls");
    expect(html).toContain("1 call");
    expect(html).toContain("1 session");
    expect(html).toContain("Read package.json");
    expect(html).toContain("codex");
    expect(html).toContain("output-available");
  });

  it("renders an empty state when no calls are available", () => {
    const html = renderToStaticMarkup(
      <ToolCallGalleryView
        data={{ generatedAt: response.generatedAt, sessions: [], toolCalls: [], warnings: [] }}
      />,
    );

    expect(html).toContain("No recorded tool calls");
  });
});
