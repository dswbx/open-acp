import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  ApprovalOutcome,
  GetGitDiffResult,
  GetGitStatusResult,
  SmokeProvider,
} from "../../src/shared/AppRPC.ts";
import type { SmokeBridge } from "../../src/mainview/bridge/SmokeBridge.ts";
import {
  GitHeaderSummary,
  calculateGitDiffLineTotalsFromTexts,
  calculateGitDiffLineTotals,
  formatGitSessionSummary,
  getGitBranchLabel,
  hydrateGitStatus,
  useGitStore,
} from "../../src/mainview/features/git/index.ts";
import { useSessionStore } from "../../src/mainview/state/sessionStore.ts";

function createGitStatus(
  cwd: string,
  overrides: Partial<GetGitStatusResult> = {},
): GetGitStatusResult {
  return {
    cwd,
    isGitRepository: true,
    repositoryRoot: cwd,
    branch: "main",
    summary: {
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicted: 0,
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      copied: 0,
      typeChanged: 0,
    },
    files: [],
    ...overrides,
  };
}

function createGitDiff(
  cwd: string,
  text: string,
  overrides: Partial<GetGitDiffResult> = {},
): GetGitDiffResult {
  return {
    cwd,
    isGitRepository: true,
    repositoryRoot: cwd,
    text,
    files: [
      {
        path: "src/mainview/App.tsx",
        text,
      },
    ],
    ...overrides,
  };
}

class GitFeatureBridge implements SmokeBridge {
  readonly gitStatusesByCwd: Record<string, GetGitStatusResult> = {};
  readonly gitDiffsByCwd: Record<string, GetGitDiffResult> = {};

  isAvailable(): boolean {
    return true;
  }

  async startSmokeTest() {
    throw new Error("not used");
  }

  async sendChatMessage() {
    throw new Error("not used");
  }

  async cancelChatMessage(
    provider: SmokeProvider,
    sessionId?: string,
    requestId?: string,
    cwd?: string,
  ) {
    return {
      provider,
      requestId: requestId ?? "request-1",
      sessionId: sessionId ?? "session-1",
      cwd: cwd ?? "/workspace/project",
      cancelledAt: "2026-04-22T00:00:00.000Z",
    };
  }

  async createChatSession(provider: SmokeProvider, cwd?: string) {
    return {
      provider,
      sessionId: "session-1",
      cwd: cwd ?? "/workspace/project",
    };
  }

  async getHomeDirectory() {
    return { path: "/Users/tester" };
  }

  async chooseWorkingDirectory(startingFolder?: string) {
    return { path: startingFolder ?? "/workspace/project" };
  }

  async listDirectory(cwd: string) {
    return { cwd, entries: [] };
  }

  async getGitStatus(cwd: string) {
    return this.gitStatusesByCwd[cwd] ?? createGitStatus(cwd);
  }

  async getGitBranches(cwd: string) {
    const status = await this.getGitStatus(cwd);
    return {
      cwd,
      isGitRepository: status.isGitRepository,
      repositoryRoot: status.repositoryRoot,
      currentBranch: status.branch,
      detached: status.detached,
      branches: status.branch
        ? [
            {
              name: status.branch,
              isCurrent: true,
            },
          ]
        : [],
    };
  }

  async getGitDiff(cwd: string) {
    return (
      this.gitDiffsByCwd[cwd] ??
      createGitDiff(cwd, "", {
        files: [],
      })
    );
  }

  async getGitFileDiff(cwd: string, path: string, originalPath?: string) {
    return {
      cwd,
      path,
      originalPath,
      text: "",
    };
  }

  async switchGitBranch(cwd: string, branch: string) {
    const current = this.gitStatusesByCwd[cwd] ?? createGitStatus(cwd);
    this.gitStatusesByCwd[cwd] = {
      ...current,
      branch,
    };
    return {
      cwd,
      previousBranch: current.branch,
      currentBranch: branch,
    };
  }

  async getProviderModelCatalog(provider: SmokeProvider) {
    return {
      provider,
      catalog: {
        provider,
        models: [],
        hasAttemptedDiscovery: false,
        source: "fallback" as const,
      },
    };
  }

  async getAvailableCommands(provider: SmokeProvider, sessionId?: string) {
    return {
      provider,
      sessionId: sessionId ?? "session-1",
      commands: [],
    };
  }

  async respondToApproval(provider: SmokeProvider, approvalId: string, outcome: ApprovalOutcome) {
    return {
      provider,
      approvalId,
      sessionId: "session-1",
      outcome,
    };
  }

  subscribe(): () => void {
    return () => {};
  }
}

describe("git feature helpers", () => {
  beforeEach(() => {
    useGitStore.getState().reset();
    useSessionStore.getState().reset();
  });

  it("formats branch labels for normal and detached HEAD states", () => {
    expect(getGitBranchLabel(createGitStatus("/workspace/project", { branch: "main" }))).toBe(
      "main",
    );
    expect(
      getGitBranchLabel(
        createGitStatus("/workspace/project", {
          branch: undefined,
          detached: true,
          head: "abc1234",
        }),
      ),
    ).toBe("detached @ abc1234");
  });

  it("formats session summaries for clean and changed repositories", () => {
    expect(formatGitSessionSummary(createGitStatus("/workspace/project"))).toBe("clean");
    expect(
      formatGitSessionSummary(
        createGitStatus("/workspace/project", {
          files: [
            {
              path: "src/mainview/App.tsx",
              indexStatus: "modified",
              workingTreeStatus: "modified",
              summary: "Modified",
            },
          ],
        }),
      ),
    ).toBe("1 changed");
  });

  it("counts git diff additions and deletions for header totals", () => {
    const diffText = [
      "diff --git a/src/mainview/App.tsx b/src/mainview/App.tsx",
      "--- a/src/mainview/App.tsx",
      "+++ b/src/mainview/App.tsx",
      "@@ -1 +1,2 @@",
      "-old line",
      "+new line",
      "+added line",
    ].join("\n");

    expect(calculateGitDiffLineTotals(createGitDiff("/workspace/project", diffText))).toEqual({
      additions: 2,
      deletions: 1,
    });
  });

  it("counts git diff additions and deletions across file diff texts", () => {
    expect(
      calculateGitDiffLineTotalsFromTexts([
        ["diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "+one", "-two"].join("\n"),
        ["diff --git a/b.ts b/b.ts", "--- a/b.ts", "+++ b/b.ts", "+three"].join("\n"),
      ]),
    ).toEqual({
      additions: 2,
      deletions: 1,
    });
  });
});

describe("GitHeaderSummary", () => {
  it("renders the branch switcher with a diff loading placeholder", () => {
    const html = renderToStaticMarkup(
      <GitHeaderSummary
        cwd="/workspace/project"
        diffTotals={undefined}
        diffTotalsError={undefined}
        gitStatus={createGitStatus("/workspace/project", {
          files: [
            {
              path: "src/mainview/App.tsx",
              indexStatus: "modified",
              workingTreeStatus: "modified",
              summary: "Modified",
            },
          ],
        })}
        gitStatusError={undefined}
        isGitDiffTotalsLoading
        isGitStatusLoading={false}
        onBranchSwitched={async () => {}}
        smokeBridge={new GitFeatureBridge()}
      />,
    );

    expect(html).toContain("main");
    expect(html).toContain("Loading diff totals...");
    expect(html).toContain('aria-label="Switch branch"');
  });

  it("falls back to the git status summary when diff totals are zero for changed files", () => {
    const html = renderToStaticMarkup(
      <GitHeaderSummary
        cwd="/workspace/project"
        diffTotals={{ additions: 0, deletions: 0 }}
        diffTotalsError={undefined}
        gitStatus={createGitStatus("/workspace/project", {
          summary: {
            staged: 0,
            unstaged: 1,
            untracked: 0,
            conflicted: 0,
            added: 0,
            modified: 1,
            deleted: 0,
            renamed: 0,
            copied: 0,
            typeChanged: 0,
          },
          files: [
            {
              path: "src/mainview/App.tsx",
              indexStatus: "unmodified",
              workingTreeStatus: "modified",
              summary: "Modified",
            },
          ],
        })}
        gitStatusError={undefined}
        isGitDiffTotalsLoading={false}
        isGitStatusLoading={false}
        onBranchSwitched={async () => {}}
        smokeBridge={new GitFeatureBridge()}
      />,
    );

    expect(html).toContain("1 modified");
    expect(html).not.toContain("git-header-diff-totals");
  });
});

describe("hydrateGitStatus", () => {
  beforeEach(() => {
    useGitStore.getState().reset();
    useSessionStore.getState().reset();
  });

  it("updates session metadata and diff totals, then refreshes after a branch change", async () => {
    const cwd = "/workspace/project";
    const bridge = new GitFeatureBridge();
    const firstDiff = [
      "diff --git a/src/mainview/App.tsx b/src/mainview/App.tsx",
      "--- a/src/mainview/App.tsx",
      "+++ b/src/mainview/App.tsx",
      "@@ -1 +1,2 @@",
      "-old line",
      "+new line",
      "+added line",
    ].join("\n");
    const secondDiff = [
      "diff --git a/src/mainview/App.tsx b/src/mainview/App.tsx",
      "--- a/src/mainview/App.tsx",
      "+++ b/src/mainview/App.tsx",
      "@@ -1 +1,3 @@",
      "+one",
      "+two",
      "+three",
    ].join("\n");

    bridge.gitStatusesByCwd[cwd] = createGitStatus(cwd, {
      branch: "main",
      files: [
        {
          path: "src/mainview/App.tsx",
          indexStatus: "modified",
          workingTreeStatus: "modified",
          summary: "Modified",
        },
      ],
      summary: {
        staged: 1,
        unstaged: 1,
        untracked: 0,
        conflicted: 0,
        added: 0,
        modified: 1,
        deleted: 0,
        renamed: 0,
        copied: 0,
        typeChanged: 0,
      },
    });
    bridge.gitDiffsByCwd[cwd] = createGitDiff(cwd, firstDiff);
    useSessionStore.setState({
      activeSessionId: "session-1",
      selectedProvider: "codex",
      sessions: [
        {
          id: "session-1",
          provider: "codex",
          title: "Codex session",
          model: "default",
          contextWindow: "live session",
          cwd,
        },
      ],
    });

    await hydrateGitStatus(bridge, cwd, { force: true });

    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      gitBranch: "main",
      gitStatusSummary: "1 changed",
    });
    expect(useGitStore.getState().diffTotalsByCwd[cwd]).toEqual({
      additions: 2,
      deletions: 1,
    });

    bridge.gitStatusesByCwd[cwd] = createGitStatus(cwd, {
      branch: "feature/header",
      files: [
        {
          path: "src/mainview/App.tsx",
          indexStatus: "modified",
          workingTreeStatus: "modified",
          summary: "Modified",
        },
      ],
      summary: {
        staged: 1,
        unstaged: 1,
        untracked: 0,
        conflicted: 0,
        added: 0,
        modified: 1,
        deleted: 0,
        renamed: 0,
        copied: 0,
        typeChanged: 0,
      },
    });
    bridge.gitDiffsByCwd[cwd] = createGitDiff(cwd, secondDiff);

    await hydrateGitStatus(bridge, cwd, { force: true });

    expect(useSessionStore.getState().sessions[0]).toMatchObject({
      gitBranch: "feature/header",
      gitStatusSummary: "1 changed",
    });
    expect(useGitStore.getState().diffTotalsByCwd[cwd]).toEqual({
      additions: 3,
      deletions: 0,
    });
  });

  it("clears cached diff totals when the repository becomes clean", async () => {
    const cwd = "/workspace/project";
    const bridge = new GitFeatureBridge();
    useGitStore.getState().completeDiffTotalsLoad(cwd, {
      additions: 4,
      deletions: 2,
    });
    bridge.gitStatusesByCwd[cwd] = createGitStatus(cwd);

    await hydrateGitStatus(bridge, cwd, { force: true });

    expect(useGitStore.getState().diffTotalsByCwd[cwd]).toBeUndefined();
  });

  it("falls back to per-file diffs when the aggregate diff reports zero totals", async () => {
    const cwd = "/workspace/project";
    const bridge = new GitFeatureBridge();
    bridge.gitStatusesByCwd[cwd] = createGitStatus(cwd, {
      files: [
        {
          path: "src/mainview/App.tsx",
          indexStatus: "modified",
          workingTreeStatus: "modified",
          summary: "Modified",
        },
      ],
      summary: {
        staged: 1,
        unstaged: 1,
        untracked: 0,
        conflicted: 0,
        added: 0,
        modified: 1,
        deleted: 0,
        renamed: 0,
        copied: 0,
        typeChanged: 0,
      },
    });
    bridge.gitDiffsByCwd[cwd] = createGitDiff(cwd, "", {
      files: [{ path: "src/mainview/App.tsx", text: "" }],
    });
    bridge.getGitFileDiff = async (requestCwd: string, path: string, originalPath?: string) => ({
      cwd: requestCwd,
      path,
      originalPath,
      text: [
        "diff --git a/src/mainview/App.tsx b/src/mainview/App.tsx",
        "--- a/src/mainview/App.tsx",
        "+++ b/src/mainview/App.tsx",
        "+new line",
        "-old line",
      ].join("\n"),
    });

    await hydrateGitStatus(bridge, cwd, { force: true });

    expect(useGitStore.getState().diffTotalsByCwd[cwd]).toEqual({
      additions: 1,
      deletions: 1,
    });
  });
});
