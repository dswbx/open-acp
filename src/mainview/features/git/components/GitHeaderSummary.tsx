import React from "react";
import type { GetGitStatusResult } from "../../../../shared/AppRPC.ts";
import type { SmokeBridge } from "../../../bridge/SmokeBridge.ts";
import type { GitDiffTotals } from "../gitPresentation.ts";
import { formatGitChangeBreakdown } from "../gitPresentation.ts";
import { GitBranchSwitcher } from "./GitBranchSwitcher.tsx";

interface GitHeaderSummaryProps {
  cwd?: string;
  gitStatus?: GetGitStatusResult;
  gitStatusError?: string;
  isGitStatusLoading: boolean;
  diffTotals?: GitDiffTotals;
  diffTotalsError?: string;
  isGitDiffTotalsLoading: boolean;
  smokeBridge: SmokeBridge;
  onBranchSwitched?: (cwd: string) => Promise<void>;
}

function renderFallbackSummary(gitStatus: GetGitStatusResult): React.ReactNode {
  return (
    <span>
      {formatGitChangeBreakdown(gitStatus.summary) || `${gitStatus.files.length} changed`}
    </span>
  );
}

export function GitHeaderSummary({
  cwd,
  gitStatus,
  gitStatusError,
  isGitStatusLoading,
  diffTotals,
  diffTotalsError,
  isGitDiffTotalsLoading,
  smokeBridge,
  onBranchSwitched,
}: GitHeaderSummaryProps): React.ReactNode {
  const trimmedCwd = cwd?.trim();
  if (!trimmedCwd) {
    return null;
  }

  if (isGitStatusLoading) {
    return <p className="text-xs text-muted-foreground">Inspecting git status...</p>;
  }

  if (gitStatusError) {
    return <p className="text-xs text-destructive">{gitStatusError}</p>;
  }

  if (!gitStatus?.isGitRepository) {
    return null;
  }

  let secondary: React.ReactNode;
  if (gitStatus.files.length === 0) {
    secondary = <span>Clean working tree</span>;
  } else if (diffTotals) {
    secondary = (
      <div className="flex items-center gap-2 font-mono">
        <span className="text-green-500">+{diffTotals.additions}</span>
        <span className="text-rose-500">-{diffTotals.deletions}</span>
      </div>
    );
  } else if (isGitDiffTotalsLoading) {
    secondary = <span>Loading diff totals...</span>;
  } else if (diffTotalsError) {
    secondary = renderFallbackSummary(gitStatus);
  } else {
    secondary = renderFallbackSummary(gitStatus);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <GitBranchSwitcher
          className="shrink-0"
          cwd={trimmedCwd}
          gitStatus={gitStatus}
          onBranchSwitched={onBranchSwitched}
          size="xs"
          smokeBridge={smokeBridge}
        />
        {secondary}
      </div>
    </div>
  );
}
