import React from "react";
import { ChevronRightIcon, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SmokeBridge } from "../../../bridge/SmokeBridge.ts";
import type { GetGitStatusResult, GitStatusFile } from "../../../../shared/AppRPC.ts";
import { GitBranchSwitcher } from "./GitBranchSwitcher.tsx";
import {
  GitDiffContent,
  getDiffFileLabel,
  getDiffStats,
  parseGitDiffText,
  type GitDiffStats,
  type ParsedGitDiffFile,
} from "./GitDiffContent.tsx";

interface GitPanelProps {
  cwd?: string;
  gitStatus?: GetGitStatusResult;
  gitStatusError?: string;
  isGitStatusLoading: boolean;
  smokeBridge: SmokeBridge;
  onRefreshGitStatus: (cwd: string) => Promise<void>;
}

interface ParsedDiffEntry {
  statusFile: GitStatusFile;
  text: string;
  parseError?: string;
  parsedFiles: ParsedGitDiffFile[];
}

function getStatusFileKey(file: { path: string; originalPath?: string }): string {
  return `${file.originalPath ?? ""}\u0000${file.path}`;
}

function getStatusFileLabel(file: GitStatusFile): string {
  return file.originalPath ? getDiffFileLabel(file.originalPath, file.path) : file.path;
}

function splitPathForMiddleTruncation(path: string): { parent: string; name: string } {
  const separatorIndex = path.lastIndexOf("/");
  if (separatorIndex === -1) {
    return { parent: "", name: path };
  }

  return {
    parent: path.slice(0, separatorIndex),
    name: path.slice(separatorIndex + 1),
  };
}

export function GitPanel({
  cwd,
  gitStatus,
  gitStatusError,
  isGitStatusLoading,
  smokeBridge,
  onRefreshGitStatus,
}: GitPanelProps): React.ReactNode {
  const [gitDiffByFileKey, setGitDiffByFileKey] = React.useState<
    Record<string, string | undefined>
  >({});
  const [gitDiffError, setGitDiffError] = React.useState<string>();
  const [isGitDiffLoading, setIsGitDiffLoading] = React.useState(false);
  const [collapsedFileKeys, setCollapsedFileKeys] = React.useState<Set<string>>(() => new Set());
  const [lastSettledGitStatus, setLastSettledGitStatus] = React.useState<GetGitStatusResult>();
  const [lastSettledParsedEntries, setLastSettledParsedEntries] = React.useState<ParsedDiffEntry[]>(
    [],
  );
  const latestRequestId = React.useRef(0);

  const toggleFileCollapsed = React.useCallback((fileKey: string) => {
    setCollapsedFileKeys((current) => {
      const next = new Set(current);
      if (next.has(fileKey)) {
        next.delete(fileKey);
      } else {
        next.add(fileKey);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!cwd?.trim()) {
      setLastSettledGitStatus(undefined);
      return;
    }
    if (!isGitStatusLoading && gitStatus) {
      setLastSettledGitStatus(gitStatus);
    }
  }, [cwd, gitStatus, isGitStatusLoading]);

  const visibleGitStatus =
    isGitStatusLoading && lastSettledGitStatus ? lastSettledGitStatus : gitStatus;

  React.useEffect(() => {
    const trimmedCwd = cwd?.trim();
    latestRequestId.current += 1;
    const requestId = latestRequestId.current;

    if (
      !trimmedCwd ||
      !gitStatus?.isGitRepository ||
      gitStatus.files.length === 0 ||
      !smokeBridge.isAvailable()
    ) {
      setGitDiffByFileKey({});
      setGitDiffError(undefined);
      setIsGitDiffLoading(false);
      return;
    }

    setIsGitDiffLoading(true);
    setGitDiffError(undefined);

    void Promise.all(
      gitStatus.files.map((file) =>
        smokeBridge.getGitFileDiff(trimmedCwd, file.path, file.originalPath),
      ),
    )
      .then((results) => {
        if (latestRequestId.current !== requestId) {
          return;
        }
        setGitDiffByFileKey(
          Object.fromEntries(results.map((entry) => [getStatusFileKey(entry), entry.text])),
        );
        setGitDiffError(undefined);
        setIsGitDiffLoading(false);
      })
      .catch((error) => {
        if (latestRequestId.current !== requestId) {
          return;
        }
        setGitDiffByFileKey({});
        setGitDiffError(error instanceof Error ? error.message : "Failed to load git diff.");
        setIsGitDiffLoading(false);
      });
  }, [cwd, gitStatus, smokeBridge]);

  const parsedEntries = React.useMemo<ParsedDiffEntry[]>(() => {
    if (!visibleGitStatus) {
      return [];
    }

    return visibleGitStatus.files.map((statusFile) => {
      const text = gitDiffByFileKey[getStatusFileKey(statusFile)] ?? "";

      if (text.trim().length === 0) {
        return {
          statusFile,
          text,
          parsedFiles: [],
        };
      }

      try {
        return {
          statusFile,
          text,
          parsedFiles: parseGitDiffText(text),
        };
      } catch (error) {
        return {
          statusFile,
          text,
          parsedFiles: [],
          parseError: error instanceof Error ? error.message : "Failed to parse git diff.",
        };
      }
    });
  }, [gitDiffByFileKey, visibleGitStatus]);

  React.useEffect(() => {
    if (!cwd?.trim()) {
      setLastSettledParsedEntries([]);
      return;
    }
    if (!isGitDiffLoading) {
      setLastSettledParsedEntries(parsedEntries);
    }
  }, [cwd, isGitDiffLoading, parsedEntries]);

  const hasVisibleDiffContent = React.useMemo(
    () =>
      lastSettledParsedEntries.some(
        (entry) =>
          entry.parseError != null || entry.parsedFiles.length > 0 || entry.text.trim().length > 0,
      ),
    [lastSettledParsedEntries],
  );
  const visibleParsedEntries =
    isGitDiffLoading && hasVisibleDiffContent ? lastSettledParsedEntries : parsedEntries;
  const totalStats = React.useMemo(
    () =>
      visibleParsedEntries.reduce<GitDiffStats>(
        (total, entry) => {
          const stats = getDiffStats(entry.parsedFiles);
          return {
            additions: total.additions + stats.additions,
            deletions: total.deletions + stats.deletions,
          };
        },
        { additions: 0, deletions: 0 },
      ),
    [visibleParsedEntries],
  );
  const shouldShowGitStatusLoading = isGitStatusLoading && !visibleGitStatus;
  const shouldShowGitDiffLoading = isGitDiffLoading && !hasVisibleDiffContent;

  return (
    <section className="flex min-h-full flex-col rounded-lg p-1" data-testid="git-panel">
      {!cwd ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-muted-foreground">
          Start or select a session to inspect its repository.
        </div>
      ) : gitStatusError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
          {gitStatusError}
        </div>
      ) : shouldShowGitStatusLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading git status...
        </div>
      ) : !visibleGitStatus?.isGitRepository ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-muted-foreground">
          This directory is not inside a git repository.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <GitBranchSwitcher
                cwd={cwd}
                gitStatus={visibleGitStatus}
                onBranchSwitched={onRefreshGitStatus}
                smokeBridge={smokeBridge}
              />
              {visibleGitStatus.files.length === 0 ? (
                <span className="text-muted-foreground">Clean working tree</span>
              ) : (
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-green-500">+{totalStats.additions}</span>
                  <span className="text-rose-500">-{totalStats.deletions}</span>
                </div>
              )}
            </div>
            <Button
              aria-label="Refresh git status"
              disabled={!cwd || isGitStatusLoading}
              onClick={() => {
                void onRefreshGitStatus(cwd);
              }}
              size="icon-xs"
              title="Refresh git status"
              variant="ghost"
            >
              <RefreshCw className={isGitStatusLoading ? "animate-spin" : undefined} />
            </Button>
          </div>

          {visibleGitStatus.files.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-muted-foreground">
              No modified, staged, or untracked files.
            </div>
          ) : shouldShowGitDiffLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading git diff...
            </div>
          ) : gitDiffError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
              {gitDiffError}
            </div>
          ) : (
            <ScrollArea className="min-h-0 rounded-md border border-border bg-muted/15">
              <div className="chat-selectable flex flex-col">
                {visibleParsedEntries.map((entry, index) => {
                  const fileKey = getStatusFileKey(entry.statusFile);
                  const isCollapsed = collapsedFileKeys.has(fileKey);
                  const fileLabel = getStatusFileLabel(entry.statusFile);
                  const { parent, name } = splitPathForMiddleTruncation(fileLabel);
                  const stats = getDiffStats(entry.parsedFiles);

                  return (
                    <section className="border-border last:border-b-0" key={`${fileKey}-${index}`}>
                      <button
                        aria-expanded={!isCollapsed}
                        className="sticky top-0 z-10 flex h-9 w-full min-w-0 items-center gap-2 border-border border-b bg-background/95 px-3 text-left font-mono transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        data-testid="git-file-header"
                        onClick={() => toggleFileCollapsed(fileKey)}
                        type="button"
                      >
                        <ChevronRightIcon
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground hover:text-foreground transition-transform",
                            !isCollapsed && "rotate-90",
                          )}
                        />
                        <span className="flex min-w-0 flex-1 items-baseline overflow-hidden text-sm">
                          {parent ? (
                            <>
                              <span className="min-w-0 truncate text-muted-foreground">
                                {parent}/
                              </span>
                              <span className="shrink-0 text-foreground">{name}</span>
                            </>
                          ) : (
                            <span className="min-w-0 truncate text-foreground">{name}</span>
                          )}
                        </span>
                        <span className="ml-auto shrink-0 text-sm">
                          {stats.additions > 0 ? (
                            <span className="text-green-500">+{stats.additions}</span>
                          ) : null}
                          {stats.deletions > 0 ? (
                            <span className="ml-2 text-rose-500">-{stats.deletions}</span>
                          ) : null}
                        </span>
                      </button>

                      {!isCollapsed ? (
                        entry.parseError ? (
                          <div className="border-border border-b bg-destructive/5 px-3 py-2 text-sm text-destructive">
                            {entry.parseError}
                          </div>
                        ) : entry.parsedFiles.length === 0 ? (
                          <div className="border-border border-b bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                            No textual diff available.
                          </div>
                        ) : (
                          <GitDiffContent parsedFiles={entry.parsedFiles} />
                        )
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </section>
  );
}
