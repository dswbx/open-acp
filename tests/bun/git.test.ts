import { describe, expect, it } from "vitest";
import {
  createEmptyGitStatusSummary,
  createGitFileSummary,
  isMissingHeadError,
  isNotGitRepositoryError,
  parseGitStatusFiles,
} from "../../src/bun/git.ts";

describe("parseGitStatusFiles", () => {
  it("parses untracked, modified, added, and renamed entries with summary counts", () => {
    const summary = createEmptyGitStatusSummary();
    const output = [
      "?? untracked.txt",
      " M modified.txt",
      "A  added.txt",
      "R  old-name.txt -> new-name.txt",
      "UU merge-conflict.txt",
    ].join("\n");

    const files = parseGitStatusFiles(output, summary);

    expect(files).toHaveLength(5);
    expect(files[0]).toMatchObject({
      path: "untracked.txt",
      indexStatus: "untracked",
      workingTreeStatus: "untracked",
      summary: "Untracked",
    });
    expect(files[1]).toMatchObject({
      path: "modified.txt",
      indexStatus: "unmodified",
      workingTreeStatus: "modified",
    });
    expect(files[2]).toMatchObject({
      path: "added.txt",
      indexStatus: "added",
      workingTreeStatus: "unmodified",
    });
    expect(files[3]).toMatchObject({
      path: "new-name.txt",
      originalPath: "old-name.txt",
      indexStatus: "renamed",
    });
    expect(files[4].summary).toBe("Conflicted");

    expect(summary.untracked).toBe(1);
    expect(summary.unstaged).toBe(3);
    expect(summary.staged).toBe(3);
    expect(summary.modified).toBe(1);
    expect(summary.added).toBe(1);
    expect(summary.renamed).toBe(1);
    expect(summary.conflicted).toBe(1);
  });

  it("ignores the `## branch` header and blank lines", () => {
    const files = parseGitStatusFiles("## main...origin/main\n\n M file.txt\n");
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("file.txt");
  });
});

describe("createGitFileSummary", () => {
  it("describes clean files", () => {
    expect(createGitFileSummary("unmodified", "unmodified")).toBe("Clean");
  });

  it("combines staged and unstaged labels", () => {
    expect(createGitFileSummary("modified", "modified")).toBe(
      "Staged modified · Unstaged modified",
    );
  });

  it("short-circuits on conflict or untracked", () => {
    expect(createGitFileSummary("updated-but-unmerged", "modified")).toBe("Conflicted");
    expect(createGitFileSummary("untracked", "untracked")).toBe("Untracked");
  });
});

describe("git error discriminators", () => {
  it("recognizes missing-HEAD errors", () => {
    expect(isMissingHeadError(new Error("fatal: bad revision 'HEAD'"))).toBe(true);
    expect(isMissingHeadError(new Error("fatal: ambiguous argument 'HEAD'"))).toBe(true);
    expect(isMissingHeadError(new Error("permission denied"))).toBe(false);
    expect(isMissingHeadError("not an error")).toBe(false);
  });

  it("recognizes not-a-git-repository errors", () => {
    expect(isNotGitRepositoryError(new Error("fatal: not a git repository"))).toBe(true);
    expect(isNotGitRepositoryError(new Error("something else"))).toBe(false);
  });
});
