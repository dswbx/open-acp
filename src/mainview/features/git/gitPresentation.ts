import type {
  GetGitDiffResult,
  GetGitStatusResult,
  GitStatusSummary,
} from "../../../shared/AppRPC.ts";

export interface GitDiffTotals {
  additions: number;
  deletions: number;
}

export function getGitBranchLabel(status?: GetGitStatusResult): string | undefined {
  if (!status?.isGitRepository) {
    return undefined;
  }

  return status.branch?.trim() || `detached @ ${status.head ?? "HEAD"}`;
}

export function formatGitSessionSummary(status: GetGitStatusResult): string | undefined {
  if (!status.isGitRepository) {
    return undefined;
  }

  return status.files.length === 0 ? "clean" : `${status.files.length} changed`;
}

export function formatGitChangeBreakdown(summary: GitStatusSummary): string {
  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${summary.added} added`);
  if (summary.modified > 0) parts.push(`${summary.modified} modified`);
  if (summary.deleted > 0) parts.push(`${summary.deleted} deleted`);
  if (summary.renamed > 0) parts.push(`${summary.renamed} renamed`);
  if (summary.untracked > 0) parts.push(`${summary.untracked} untracked`);
  if (summary.conflicted > 0) parts.push(`${summary.conflicted} conflicted`);
  return parts.join(" · ");
}

function countDiffLines(text: string): GitDiffTotals {
  let additions = 0;
  let deletions = 0;

  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
      continue;
    }
    if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return { additions, deletions };
}

export function calculateGitDiffLineTotals(diff: GetGitDiffResult): GitDiffTotals {
  if (diff.files.length > 0) {
    return diff.files.reduce<GitDiffTotals>(
      (totals, file) => {
        const next = countDiffLines(file.text);
        return {
          additions: totals.additions + next.additions,
          deletions: totals.deletions + next.deletions,
        };
      },
      { additions: 0, deletions: 0 },
    );
  }

  return countDiffLines(diff.text);
}
