import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionListPanel } from "../../src/ui/components/SessionListPanel.tsx";

describe("SessionListPanel", () => {
  it("hides session-creation controls beyond the browse button when there are no sessions yet", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId={undefined}
        onCreateSession={() => {}}
        onSelectSession={() => {}}
        sessions={[]}
      />,
    );

    expect(html).toContain("New session");
    expect(html).not.toContain("Create session");
    expect(html).not.toContain('aria-label="Provider"');
    expect(html).not.toContain('aria-label="Model"');
    expect(html).toContain("No sessions yet. Click New session to start.");
  });

  it("keeps the active row highlighted without rendering provider controls", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s2"
        onCreateSession={() => {}}
        onSelectSession={() => {}}
        sessions={[
          {
            id: "s1",
            title: "Session 1",
            model: "default",
            contextWindow: "live session",
            cwd: "/workspace/one",
          },
          {
            id: "s2",
            title: "Session 2",
            model: "claude-sonnet-4.6",
            contextWindow: "live session",
            cwd: "/workspace/two",
          },
        ]}
      />,
    );

    expect(html).toContain("New session");
    expect(html).toContain('data-session-id="s2"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Active");
    expect(html).toContain("/workspace/two");
    expect(html).not.toContain('aria-label="Provider"');
  });

  it("renders git branch metadata when available", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s1"
        onCreateSession={() => {}}
        onSelectSession={() => {}}
        sessions={[
          {
            id: "s1",
            title: "Session 1",
            model: "default",
            contextWindow: "live session",
            cwd: "/workspace/project",
            gitBranch: "main",
            gitStatusSummary: "2 changed",
          },
        ]}
      />,
    );

    expect(html).toContain("main");
    expect(html).toContain("2 changed");
    expect(html).toContain("/workspace/project");
  });

  it("renders newest sessions first in the sidebar", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s2"
        onCreateSession={() => {}}
        onSelectSession={() => {}}
        sessions={[
          {
            id: "s2",
            title: "Newest session",
            model: "default",
            contextWindow: "live session",
            cwd: "/workspace/newest",
          },
          {
            id: "s1",
            title: "Older session",
            model: "default",
            contextWindow: "live session",
            cwd: "/workspace/older",
          },
        ]}
      />,
    );

    expect(html.indexOf("Newest session")).toBeLessThan(html.indexOf("Older session"));
  });
});
