import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionListPanel } from "../../src/ui/components/SessionListPanel.tsx";

const workspace = {
  id: "workspace",
  name: "Workspace",
  rootPath: "/workspace",
  settingsPath: "/home/.open-acp/workspaces/workspace/settings.json",
  sessionsPath: "/home/.open-acp/workspaces/workspace/sessions",
  createdAt: "2026-05-07T00:00:00.000Z",
  updatedAt: "2026-05-07T00:00:00.000Z",
};

describe("SessionListPanel", () => {
  it("renders the empty workspace state before any workspaces exist", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId={undefined}
        onCreateSession={() => {}}
        onCreateWorkspace={() => {}}
        onSelectSession={() => {}}
        onSelectWorkspace={() => {}}
        sessions={[]}
        workspaces={[]}
      />,
    );

    expect(html).toContain("New workspace");
    expect(html).not.toContain("Create session");
    expect(html).not.toContain('aria-label="Provider"');
    expect(html).not.toContain('aria-label="Model"');
    expect(html).toContain("No workspaces yet. Click New workspace to start.");
  });

  it("keeps the active row highlighted without rendering provider controls", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s2"
        onCreateSession={() => {}}
        onCreateWorkspace={() => {}}
        onSelectSession={() => {}}
        onSelectWorkspace={() => {}}
        sessions={[
          {
            id: "s1",
            workspaceId: "workspace",
            title: "Session 1",
            model: "default",
            contextWindow: "live session",
            cwd: "/workspace/one",
          },
          {
            id: "s2",
            workspaceId: "workspace",
            title: "Session 2",
            model: "claude-sonnet-4.6",
            contextWindow: "live session",
            cwd: "/workspace/two",
          },
        ]}
        workspaces={[workspace]}
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
        onCreateWorkspace={() => {}}
        onSelectSession={() => {}}
        onSelectWorkspace={() => {}}
        sessions={[
          {
            id: "s1",
            workspaceId: "workspace",
            title: "Session 1",
            model: "default",
            contextWindow: "live session",
            cwd: "/workspace/project",
            gitBranch: "main",
            gitStatusSummary: "2 changed",
          },
        ]}
        workspaces={[workspace]}
      />,
    );

    expect(html).toContain("main");
    expect(html).toContain("2 changed");
    expect(html).toContain("/workspace/project");
  });

  it("sorts workspace sessions by creation date oldest first", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s2"
        onCreateSession={() => {}}
        onCreateWorkspace={() => {}}
        onSelectSession={() => {}}
        onSelectWorkspace={() => {}}
        sessions={[
          {
            id: "s2",
            workspaceId: "workspace",
            title: "Newest session",
            model: "default",
            contextWindow: "live session",
            cwd: "/workspace/newest",
            createdAt: "2026-05-07T10:00:00.000Z",
          },
          {
            id: "s1",
            workspaceId: "workspace",
            title: "Older session",
            model: "default",
            contextWindow: "live session",
            cwd: "/workspace/older",
            createdAt: "2026-05-07T09:00:00.000Z",
          },
        ]}
        workspaces={[workspace]}
      />,
    );

    expect(html.indexOf("Older session")).toBeLessThan(html.indexOf("Newest session"));
  });
});
