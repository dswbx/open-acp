import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionListPanel } from "../../src/ui/components/SessionListPanel.tsx";

describe("SessionListPanel", () => {
  it("renders only provider draft controls when no session is active", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId={undefined}
        isDraftingSession={true}
        onCreateSession={() => {}}
        onSelectProvider={() => {}}
        onSelectSession={() => {}}
        selectedProvider="claude"
        sessions={[]}
      />
    );

    expect(html).toContain("Create session");
    expect(html).toContain('aria-label="Provider"');
    expect(html).not.toContain('aria-label="Model"');
    expect(html).toContain("No sessions yet. Create one to start.");
  });

  it("marks the active row and locks provider selection for active sessions", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s2"
        isDraftingSession={false}
        onCreateSession={() => {}}
        onSelectProvider={() => {}}
        onSelectSession={() => {}}
        selectedProvider="claude"
        sessions={[
          {
            id: "s1",
            title: "Session 1",
            model: "default",
            contextWindow: "live session"
          },
          {
            id: "s2",
            title: "Session 2",
            model: "claude-sonnet-4.6",
            contextWindow: "live session"
          }
        ]}
      />
    );

    expect(html).toContain("New session");
    expect(html).toContain('data-session-id="s2"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-provider-locked="true"');
  });
});
