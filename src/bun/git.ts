import { execFile } from "node:child_process";
import type {
  GetGitBranchesResult,
  GetGitDiffResult,
  GetGitFileDiffResult,
  GetGitStatusResult,
  GitFileStatusCode,
  GitStatusSummary,
  SwitchGitBranchResult,
} from "../shared/AppRPC.ts";

const GIT_COMMAND_MAX_BUFFER = 1024 * 1024;
const GIT_DIFF_MAX_BUFFER = 8 * 1024 * 1024;

interface RunGitCommandOptions {
  acceptedExitCodes?: number[];
  maxBuffer?: number;
  trimOutput?: boolean;
}

function createEmptyGitStatusSummary(): GitStatusSummary {
  return {
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
  };
}

async function runGitCommand(
  cwd: string,
  args: string[],
  options: RunGitCommandOptions = {},
): Promise<string> {
  const {
    acceptedExitCodes = [0],
    maxBuffer = GIT_COMMAND_MAX_BUFFER,
    trimOutput = true,
  } = options;

  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        encoding: "utf8",
        maxBuffer,
      },
      (error, stdout, stderr) => {
        const output = trimOutput ? stdout.trim() : stdout;
        if (error) {
          const errorCode = (error as NodeJS.ErrnoException).code;
          const exitCode = typeof errorCode === "number" ? errorCode : undefined;
          if (exitCode != null && acceptedExitCodes.includes(exitCode)) {
            resolve(output);
            return;
          }

          const message = stderr.trim() || error.message;
          reject(
            Object.assign(new Error(message), {
              code: (error as NodeJS.ErrnoException).code,
            }),
          );
          return;
        }

        resolve(output);
      },
    );
  });
}

function isNotGitRepositoryError(error: unknown): boolean {
  return error instanceof Error && /not a git repository/i.test(error.message);
}

function normalizeGitStatusCode(code: string): GitFileStatusCode {
  switch (code) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "U":
      return "updated-but-unmerged";
    case "T":
      return "type-changed";
    case "?":
      return "untracked";
    default:
      return "unmodified";
  }
}

function parseGitStatusFiles(statusOutput: string, summary?: GitStatusSummary) {
  return statusOutput
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.startsWith("## "))
    .map((line) => {
      if (line.startsWith("?? ")) {
        if (summary) {
          summary.untracked += 1;
          summary.unstaged += 1;
        }
        return {
          path: line.slice(3).trim(),
          indexStatus: "untracked" as const,
          workingTreeStatus: "untracked" as const,
          summary: "Untracked",
        };
      }

      const indexStatus = normalizeGitStatusCode(line[0] ?? " ");
      const workingTreeStatus = normalizeGitStatusCode(line[1] ?? " ");
      const rawPath = line.slice(3).trim();
      const renameMatch = rawPath.match(/^(.*) -> (.*)$/);
      const originalPath = renameMatch?.[1]?.trim();
      const path = renameMatch?.[2]?.trim() || rawPath;

      if (
        summary &&
        (indexStatus === "updated-but-unmerged" || workingTreeStatus === "updated-but-unmerged")
      ) {
        summary.conflicted += 1;
      }
      if (summary && indexStatus !== "unmodified" && indexStatus !== "untracked") {
        summary.staged += 1;
        applyGitStatusCodeToSummary(summary, indexStatus);
      }
      if (summary && workingTreeStatus !== "unmodified" && workingTreeStatus !== "untracked") {
        summary.unstaged += 1;
        applyGitStatusCodeToSummary(summary, workingTreeStatus);
      }

      return {
        path,
        originalPath,
        indexStatus,
        workingTreeStatus,
        summary: createGitFileSummary(indexStatus, workingTreeStatus),
      };
    });
}

function isMissingHeadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /bad revision|bad object|needed a single revision|unknown revision|ambiguous argument 'HEAD'/i.test(
      error.message,
    )
  );
}

async function hasGitHead(cwd: string): Promise<boolean> {
  try {
    await runGitCommand(cwd, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch (error) {
    if (isMissingHeadError(error)) {
      return false;
    }
    throw error;
  }
}

async function runGitDiffCommand(cwd: string, args: string[]): Promise<string> {
  return runGitCommand(cwd, args, {
    acceptedExitCodes: [0, 1],
    maxBuffer: GIT_DIFF_MAX_BUFFER,
    trimOutput: false,
  });
}

function getGitDiffPaths(file: { path: string; originalPath?: string }): string[] {
  return Array.from(new Set(file.originalPath ? [file.originalPath, file.path] : [file.path]));
}

function applyGitStatusCodeToSummary(summary: GitStatusSummary, code: GitFileStatusCode): void {
  if (code === "added") {
    summary.added += 1;
    return;
  }
  if (code === "modified") {
    summary.modified += 1;
    return;
  }
  if (code === "deleted") {
    summary.deleted += 1;
    return;
  }
  if (code === "renamed") {
    summary.renamed += 1;
    return;
  }
  if (code === "copied") {
    summary.copied += 1;
    return;
  }
  if (code === "type-changed") {
    summary.typeChanged += 1;
  }
}

function createGitFileSummary(
  indexStatus: GitFileStatusCode,
  workingTreeStatus: GitFileStatusCode,
): string {
  if (indexStatus === "untracked" || workingTreeStatus === "untracked") {
    return "Untracked";
  }
  if (indexStatus === "updated-but-unmerged" || workingTreeStatus === "updated-but-unmerged") {
    return "Conflicted";
  }

  const parts: string[] = [];
  if (indexStatus !== "unmodified") {
    parts.push(`Staged ${indexStatus}`);
  }
  if (workingTreeStatus !== "unmodified") {
    parts.push(`Unstaged ${workingTreeStatus}`);
  }
  return parts.join(" · ") || "Clean";
}

export async function inspectGitDirectory(cwd: string): Promise<GetGitStatusResult> {
  const summary = createEmptyGitStatusSummary();

  try {
    const repositoryRoot = await runGitCommand(cwd, ["rev-parse", "--show-toplevel"]);
    const [branchOutput, headOutput, statusOutput] = await Promise.all([
      runGitCommand(cwd, ["branch", "--show-current"]),
      runGitCommand(cwd, ["rev-parse", "--short", "HEAD"]),
      runGitCommand(cwd, ["status", "--porcelain=v1", "--branch"]),
    ]);

    const files = parseGitStatusFiles(statusOutput, summary);

    return {
      cwd,
      isGitRepository: true,
      repositoryRoot,
      branch: branchOutput.trim() || undefined,
      head: headOutput.trim() || undefined,
      detached: branchOutput.trim().length === 0,
      summary,
      files,
    };
  } catch (error) {
    if (isNotGitRepositoryError(error)) {
      return {
        cwd,
        isGitRepository: false,
        summary,
        files: [],
      };
    }
    throw error;
  }
}

export async function listKnownGitBranches(cwd: string): Promise<GetGitBranchesResult> {
  try {
    const [repositoryRoot, currentBranchOutput, branchOutput] = await Promise.all([
      runGitCommand(cwd, ["rev-parse", "--show-toplevel"]),
      runGitCommand(cwd, ["branch", "--show-current"]),
      runGitCommand(cwd, [
        "for-each-ref",
        "--sort=refname",
        "--format=%(refname:short)",
        "refs/heads",
      ]),
    ]);

    const currentBranch = currentBranchOutput.trim() || undefined;

    return {
      cwd,
      isGitRepository: true,
      repositoryRoot,
      currentBranch,
      detached: currentBranch == null,
      branches: branchOutput
        .split(/\r?\n/)
        .map((branch) => branch.trim())
        .filter((branch) => branch.length > 0)
        .map((branch) => ({
          name: branch,
          isCurrent: branch === currentBranch,
        })),
    };
  } catch (error) {
    if (isNotGitRepositoryError(error)) {
      return {
        cwd,
        isGitRepository: false,
        branches: [],
      };
    }
    throw error;
  }
}

export async function switchGitBranch(cwd: string, branch: string): Promise<SwitchGitBranchResult> {
  const nextBranch = branch.trim();
  if (nextBranch.length === 0) {
    throw new Error("Branch name is required.");
  }

  const gitBranches = await listKnownGitBranches(cwd);
  if (!gitBranches.isGitRepository) {
    throw new Error("This directory is not inside a git repository.");
  }

  const branchExists = gitBranches.branches.some((entry) => entry.name === nextBranch);
  if (!branchExists) {
    throw new Error(`Unknown local branch "${nextBranch}".`);
  }

  if (gitBranches.currentBranch === nextBranch) {
    return {
      cwd,
      previousBranch: gitBranches.currentBranch,
      currentBranch: nextBranch,
    };
  }

  await runGitCommand(cwd, ["switch", nextBranch]);
  const currentBranch = await runGitCommand(cwd, ["branch", "--show-current"]);

  if (currentBranch.trim() !== nextBranch) {
    throw new Error(
      currentBranch.trim().length > 0
        ? `Branch switch did not complete. Repository is now on "${currentBranch.trim()}".`
        : "Branch switch did not complete because HEAD is detached.",
    );
  }

  return {
    cwd,
    previousBranch: gitBranches.currentBranch,
    currentBranch: nextBranch,
  };
}

export async function inspectGitDiff(cwd: string): Promise<GetGitDiffResult> {
  try {
    const [repositoryRoot, statusOutput] = await Promise.all([
      runGitCommand(cwd, ["rev-parse", "--show-toplevel"]),
      runGitCommand(cwd, ["status", "--porcelain=v1"]),
    ]);
    const files = parseGitStatusFiles(statusOutput);

    if (files.length === 0) {
      return {
        cwd,
        isGitRepository: true,
        repositoryRoot,
        text: "",
        files: [],
      };
    }

    const hasHeadRevision = await hasGitHead(cwd);
    const diffParts: string[] = [];
    const fileDiffs: GetGitDiffResult["files"] = [];

    for (const file of files) {
      const diffPaths = getGitDiffPaths(file);
      let fileText = "";
      const fileParts: string[] = [];

      if (
        file.indexStatus === "updated-but-unmerged" ||
        file.workingTreeStatus === "updated-but-unmerged"
      ) {
        fileDiffs.push({
          path: file.path,
          originalPath: file.originalPath,
          text: "",
        });
        continue;
      }

      if (file.indexStatus === "untracked" || file.workingTreeStatus === "untracked") {
        const untrackedDiff = await runGitDiffCommand(cwd, [
          "diff",
          "--no-index",
          "--patch",
          "--no-ext-diff",
          "-U1",
          "--",
          "/dev/null",
          file.path,
        ]);
        if (untrackedDiff.trim().length > 0) {
          fileText = untrackedDiff.trimEnd();
          diffParts.push(fileText);
        }
        fileDiffs.push({
          path: file.path,
          originalPath: file.originalPath,
          text: fileText,
        });
        continue;
      }

      if (file.indexStatus !== "unmodified") {
        const stagedDiff = await runGitDiffCommand(cwd, [
          "diff",
          "--cached",
          "--patch",
          "--binary",
          "--find-renames",
          "--no-ext-diff",
          "-U1",
          ...(hasHeadRevision ? [] : ["--root"]),
          "--",
          ...diffPaths,
        ]);
        if (stagedDiff.trim().length > 0) {
          fileParts.push(stagedDiff.trimEnd());
        }
      }

      if (file.workingTreeStatus !== "unmodified") {
        const unstagedDiff = await runGitDiffCommand(cwd, [
          "diff",
          "--patch",
          "--binary",
          "--find-renames",
          "--no-ext-diff",
          "-U1",
          "--",
          ...diffPaths,
        ]);
        if (unstagedDiff.trim().length > 0) {
          fileParts.push(unstagedDiff.trimEnd());
        }
      }

      if (fileParts.length === 0 && hasHeadRevision) {
        const fallbackDiff = await runGitDiffCommand(cwd, [
          "diff",
          "--patch",
          "--binary",
          "--find-renames",
          "--no-ext-diff",
          "-U1",
          "HEAD",
          "--",
          ...diffPaths,
        ]);
        if (fallbackDiff.trim().length > 0) {
          fileParts.push(fallbackDiff.trimEnd());
        }
      }

      fileText = fileParts.join("\n\n");
      if (fileText.length > 0) {
        diffParts.push(fileText);
      }

      fileDiffs.push({
        path: file.path,
        originalPath: file.originalPath,
        text: fileText,
      });
    }

    return {
      cwd,
      isGitRepository: true,
      repositoryRoot,
      text: diffParts.join("\n\n"),
      files: fileDiffs,
    };
  } catch (error) {
    if (isNotGitRepositoryError(error)) {
      return {
        cwd,
        isGitRepository: false,
        text: "",
        files: [],
      };
    }
    throw error;
  }
}

export async function inspectGitFileDiff(
  cwd: string,
  filePath: string,
  originalPath?: string,
): Promise<GetGitFileDiffResult> {
  try {
    await runGitCommand(cwd, ["rev-parse", "--show-toplevel"]);
    const hasHeadRevision = await hasGitHead(cwd);
    const diffPaths = Array.from(new Set(originalPath ? [originalPath, filePath] : [filePath]));
    const fileParts: string[] = [];

    const stagedDiff = await runGitDiffCommand(cwd, [
      "diff",
      "--cached",
      "--patch",
      "--binary",
      "--find-renames",
      "--no-ext-diff",
      "-U1",
      ...(hasHeadRevision ? [] : ["--root"]),
      "--",
      ...diffPaths,
    ]);
    if (stagedDiff.trim().length > 0) {
      fileParts.push(stagedDiff.trimEnd());
    }

    const unstagedDiff = await runGitDiffCommand(cwd, [
      "diff",
      "--patch",
      "--binary",
      "--find-renames",
      "--no-ext-diff",
      "-U1",
      "--",
      ...diffPaths,
    ]);
    if (unstagedDiff.trim().length > 0) {
      fileParts.push(unstagedDiff.trimEnd());
    }

    if (fileParts.length === 0 && hasHeadRevision) {
      const fallbackDiff = await runGitDiffCommand(cwd, [
        "diff",
        "--patch",
        "--binary",
        "--find-renames",
        "--no-ext-diff",
        "-U1",
        "HEAD",
        "--",
        ...diffPaths,
      ]);
      if (fallbackDiff.trim().length > 0) {
        fileParts.push(fallbackDiff.trimEnd());
      }
    }

    if (fileParts.length === 0) {
      const untrackedDiff = await runGitDiffCommand(cwd, [
        "diff",
        "--no-index",
        "--patch",
        "--no-ext-diff",
        "-U1",
        "--",
        "/dev/null",
        filePath,
      ]);
      if (untrackedDiff.trim().length > 0) {
        fileParts.push(untrackedDiff.trimEnd());
      }
    }

    return {
      cwd,
      path: filePath,
      originalPath,
      text: fileParts.join("\n\n"),
    };
  } catch (error) {
    if (isNotGitRepositoryError(error)) {
      return {
        cwd,
        path: filePath,
        originalPath,
        text: "",
      };
    }
    throw error;
  }
}
