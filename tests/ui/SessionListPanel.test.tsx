import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionListPanel } from "../../src/ui/components/SessionListPanel.tsx";

describe("SessionListPanel", () => {
  it("renders selectable sessions and marks the active row", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s2"
        onCreateSession={() => {}}
        onSelectSession={() => {}}
        sessions={[
          {
            id: "s1",
            title: "Session 1",
            model: "gpt-5.3-codex",
            contextWindow: "unknown"
          },
          {
            id: "s2",
            title: "Session 2",
            model: "claude-sonnet-4.6",
            contextWindow: "unknown"
          }
        ]}
      />
    );

    expect(html).toContain('data-session-id="s1"');
    expect(html).toContain('data-session-id="s2"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-pressed="true"');
  });
});
