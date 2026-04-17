import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionListPanel } from "../../src/ui/components/SessionListPanel.tsx";

describe("SessionListPanel", () => {
  it("hides the provider picker in browse mode when there are no sessions yet", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId={undefined}
        isDraftingSession={false}
        onCreateSession={() => {}}
        onSelectProvider={() => {}}
        onSelectSession={() => {}}
        selectedProvider="claude"
        sessions={[]}
      />
    );

    expect(html).toContain("New session");
    expect(html).not.toContain('aria-label="Provider"');
    expect(html).not.toContain('aria-label="Model"');
    expect(html).toContain("No sessions yet. Click New session to start.");
  });

  it("shows the provider picker only in draft mode", () => {
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
  });

  it("keeps the active row highlighted without rendering provider controls in browse mode", () => {
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
    expect(html).toContain("Active");
    expect(html).not.toContain('aria-label="Provider"');
  });

  it("renders newest sessions first in the sidebar", () => {
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
            id: "s2",
            title: "Newest session",
            model: "default",
            contextWindow: "live session"
          },
          {
            id: "s1",
            title: "Older session",
            model: "default",
            contextWindow: "live session"
          }
        ]}
      />
    );

    expect(html.indexOf("Newest session")).toBeLessThan(html.indexOf("Older session"));
  });
});
