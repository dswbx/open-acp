import type {
  GetGitBranchesResult,
  GetGitDiffResult,
  GetGitFileDiffResult,
  GetGitStatusResult,
} from "../shared/AppRPC.ts";

export function createEmptyGitStatus(cwd: string): GetGitStatusResult {
  return {
    cwd,
    isGitRepository: false,
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
  };
}

export function createEmptyGitDiff(cwd: string): GetGitDiffResult {
  return {
    cwd,
    isGitRepository: false,
    text: "",
    files: [],
  };
}

export function createEmptyGitBranches(cwd: string): GetGitBranchesResult {
  return {
    cwd,
    isGitRepository: false,
    branches: [],
  };
}

export function createEmptyGitFileDiff(
  cwd: string,
  path: string,
  originalPath?: string,
): GetGitFileDiffResult {
  return {
    cwd,
    path,
    originalPath,
    text: "",
  };
}
