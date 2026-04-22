import React from "react";
import {
  Diff,
  Hunk,
  getChangeKey,
  getCollapsedLinesCountBetween,
  isNormal,
  markEdits,
  parseDiff,
  tokenize,
} from "react-diff-view";
import type { RenderGutter, RenderToken, TokenNode } from "react-diff-view";
import { ChevronRightIcon, Loader2, RefreshCw } from "lucide-react";
import { getCodeLanguageForPath } from "@/components/ai-elements/code-rendering";
import { CodeTokenSpan, highlightCode } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SmokeBridge } from "../../../bridge/SmokeBridge.ts";
import type { GetGitStatusResult, GitStatusFile } from "../../../../shared/AppRPC.ts";
import { GitBranchSwitcher } from "./GitBranchSwitcher.tsx";

interface GitPanelProps {
  cwd?: string;
  gitStatus?: GetGitStatusResult;
  gitStatusError?: string;
  isGitStatusLoading: boolean;
  smokeBridge: SmokeBridge;
  onRefreshGitStatus: (cwd: string) => Promise<void>;
}

type ParsedDiffFile = ReturnType<typeof parseDiff>[number] & {
  tokens: ReturnType<typeof tokenize> | null;
};

interface ParsedDiffEntry {
  statusFile: GitStatusFile;
  text: string;
  parseError?: string;
  parsedFiles: ParsedDiffFile[];
}

interface DiffStats {
  additions: number;
  deletions: number;
}

interface GitDiffWidgets {
  widgets: Record<string, React.ReactNode>;
  collapsedLabels: string[];
}

const renderCompactDiffGutter: RenderGutter = ({ change, side, wrapInAnchor }) => {
  if (side === "old") {
    return null;
  }

  const lineNumber = isNormal(change) ? change.newLineNumber : change.lineNumber;
  return wrapInAnchor(lineNumber);
};

function GitDiffHighlightedText({
  code,
  language,
}: {
  code: string;
  language: ReturnType<typeof getCodeLanguageForPath>;
}): React.ReactNode {
  const requestKey = React.useMemo(() => `${language}:${code}`, [code, language]);
  const syncTokens = React.useMemo(() => highlightCode(code, language), [code, language]);
  const [asyncTokens, setAsyncTokens] = React.useState<{
    requestKey: string;
    tokens: NonNullable<ReturnType<typeof highlightCode>>;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const immediate = highlightCode(code, language, (result) => {
      if (!cancelled) {
        setAsyncTokens({ requestKey, tokens: result });
      }
    });
    setAsyncTokens(immediate ? { requestKey, tokens: immediate } : null);

    return () => {
      cancelled = true;
    };
  }, [code, language, requestKey]);

  const tokenized = asyncTokens?.requestKey === requestKey ? asyncTokens.tokens : syncTokens;
  const [tokens = []] = tokenized?.tokens ?? [];

  if (!tokenized || tokens.length === 0) {
    return (
      <span data-git-highlight-state="pending" key={requestKey}>
        {code}
      </span>
    );
  }

  return (
    <span data-git-highlight-state="ready" key={requestKey}>
      {tokens.map((token, index) => (
        <CodeTokenSpan key={`${requestKey}-${index}-${token.content}`} token={token} />
      ))}
    </span>
  );
}

function renderDiffTokenChildren(
  children: TokenNode[] | undefined,
  language: ReturnType<typeof getCodeLanguageForPath>,
) {
  return children?.map((child, index) => renderDiffTokenNode(child, language, index));
}

function renderDiffTokenNode(
  token: TokenNode,
  language: ReturnType<typeof getCodeLanguageForPath>,
  index: number,
): React.ReactNode {
  if (token.type === "text") {
    return (
      <span data-git-tokenized="true" key={`${index}-${token.value}`}>
        <GitDiffHighlightedText code={token.value as string} language={language} />
      </span>
    );
  }

  if (token.type === "edit") {
    return (
      <span className="diff-code-edit" key={`${index}-edit`}>
        {renderDiffTokenChildren(token.children, language)}
      </span>
    );
  }

  if (token.type === "mark") {
    return (
      <span className={`diff-code-mark diff-code-mark-${token.markType}`} key={`${index}-mark`}>
        {renderDiffTokenChildren(token.children, language)}
      </span>
    );
  }

  return (
    <span
      className={cn(token.className, token.properties?.className)}
      key={`${index}-${token.type}`}
    >
      {renderDiffTokenChildren(token.children, language)}
    </span>
  );
}

const renderDiffCodeToken = (path: string): RenderToken => {
  const language = getCodeLanguageForPath(path);
  return (token, renderDefault, index) => {
    if (token.type === "text" || token.children) {
      return renderDiffTokenNode(token, language, index);
    }

    return renderDefault(token, index);
  };
};

function stripDiffPrefix(path: string): string {
  return path.replace(/^[ab]\//, "");
}

function getDiffFileLabel(oldPath: string, newPath: string): string {
  const normalizedOldPath = stripDiffPrefix(oldPath);
  const normalizedNewPath = stripDiffPrefix(newPath);
  if (normalizedOldPath === "/dev/null") {
    return normalizedNewPath;
  }
  if (normalizedNewPath === "/dev/null") {
    return normalizedOldPath;
  }
  return normalizedOldPath === normalizedNewPath
    ? normalizedNewPath
    : `${normalizedOldPath} -> ${normalizedNewPath}`;
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

function getDiffStats(files: ParsedDiffFile[]): DiffStats {
  let additions = 0;
  let deletions = 0;

  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const change of hunk.changes) {
        if (change.type === "insert") {
          additions += 1;
        }
        if (change.type === "delete") {
          deletions += 1;
        }
      }
    }
  }

  return { additions, deletions };
}

function parseDiffEntry(text: string): ParsedDiffFile[] {
  return parseDiff(text, { nearbySequences: "zip" }).map((file) => {
    try {
      return {
        ...file,
        tokens: tokenize(file.hunks, {
          enhancers: [markEdits(file.hunks)],
        }),
      };
    } catch {
      return {
        ...file,
        tokens: null,
      };
    }
  });
}

function formatCollapsedContextLabel(lineCount: number): string {
  return `${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}`;
}

function buildDiffWidgets(files: ParsedDiffFile[]): GitDiffWidgets {
  const widgets: Record<string, React.ReactNode> = {};
  const collapsedLabels: string[] = [];

  for (const file of files) {
    for (let index = 0; index < file.hunks.length - 1; index += 1) {
      const currentHunk = file.hunks[index];
      const nextHunk = file.hunks[index + 1];
      const collapsedLineCount = getCollapsedLinesCountBetween(currentHunk, nextHunk);
      const anchorChange = currentHunk.changes[currentHunk.changes.length - 1];
      if (!anchorChange || collapsedLineCount <= 0) {
        continue;
      }

      const label = formatCollapsedContextLabel(collapsedLineCount);
      collapsedLabels.push(label);
      widgets[getChangeKey(anchorChange)] = (
        <div
          className="git-diff-context-breaker px-3 py-1 text-[11px] text-muted-foreground"
          data-git-collapsed-context={label}
        >
          {label}
        </div>
      );
    }
  }

  return { widgets, collapsedLabels };
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
          parsedFiles: parseDiffEntry(text),
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
      visibleParsedEntries.reduce<DiffStats>(
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
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          Start or select a session to inspect its repository.
        </div>
      ) : gitStatusError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {gitStatusError}
        </div>
      ) : shouldShowGitStatusLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading git status...
        </div>
      ) : !visibleGitStatus?.isGitRepository ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
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
                <span className="text-sm text-muted-foreground">Clean working tree</span>
              ) : (
                <div className="flex items-center gap-2 font-mono text-sm">
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
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No modified, staged, or untracked files.
            </div>
          ) : shouldShowGitDiffLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading git diff...
            </div>
          ) : gitDiffError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
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
                        <span className="flex min-w-0 flex-1 items-baseline overflow-hidden text-xs">
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
                        <span className="ml-auto shrink-0 text-[11px]">
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
                          <div className="border-border border-b bg-destructive/5 px-3 py-2 text-xs text-destructive">
                            {entry.parseError}
                          </div>
                        ) : entry.parsedFiles.length === 0 ? (
                          <div className="border-border border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            No textual diff available.
                          </div>
                        ) : (
                          entry.parsedFiles.map((file, fileIndex) => {
                            const fileLabel = getDiffFileLabel(file.oldPath, file.newPath);
                            const { widgets } = buildDiffWidgets([file]);

                            return (
                              <div
                                data-git-diff-file={fileLabel}
                                data-git-diff-view="unified"
                                key={`${file.oldRevision}-${file.newRevision}-${fileIndex}`}
                              >
                                <Diff
                                  className={cn(
                                    "git-diff-view git-diff-table git-diff-compact-gutter text-[11px]",
                                  )}
                                  diffType={file.type}
                                  hunks={file.hunks}
                                  optimizeSelection
                                  renderGutter={renderCompactDiffGutter}
                                  renderToken={renderDiffCodeToken(fileLabel)}
                                  tokens={file.tokens}
                                  viewType="unified"
                                  widgets={widgets}
                                >
                                  {(hunks) =>
                                    hunks.map((hunk) => <Hunk hunk={hunk} key={hunk.content} />)
                                  }
                                </Diff>
                              </div>
                            );
                          })
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
