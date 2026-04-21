import React from "react";
import { Diff, Hunk, isNormal, markEdits, parseDiff, tokenize } from "react-diff-view";
import type { RenderGutter, RenderToken, TokenNode } from "react-diff-view";
import { ChevronRightIcon, Loader2 } from "lucide-react";
import { getCodeLanguageForPath } from "@/components/ai-elements/code-rendering";
import { InlineCodeTokens } from "@/components/ai-elements/code-block";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SmokeBridge } from "../bridge/SmokeBridge.ts";
import { GitBranchSwitcher } from "./GitBranchSwitcher.tsx";
import type { GetGitStatusResult, GitStatusFile } from "../../shared/AppRPC.ts";

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

const renderCompactDiffGutter: RenderGutter = ({ change, side, wrapInAnchor }) => {
  if (side === "old") {
    return null;
  }

  const lineNumber = isNormal(change) ? change.newLineNumber : change.lineNumber;
  return wrapInAnchor(lineNumber);
};

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
      <InlineCodeTokens
        code={token.value as string}
        key={`${index}-${token.value}`}
        language={language}
      />
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
    if (!gitStatus) {
      return [];
    }

    return gitStatus.files.map((statusFile) => {
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
  }, [gitDiffByFileKey, gitStatus]);
  const totalStats = React.useMemo(
    () =>
      parsedEntries.reduce<DiffStats>(
        (total, entry) => {
          const stats = getDiffStats(entry.parsedFiles);
          return {
            additions: total.additions + stats.additions,
            deletions: total.deletions + stats.deletions,
          };
        },
        { additions: 0, deletions: 0 },
      ),
    [parsedEntries],
  );

  return (
    <section className="flex min-h-full flex-col rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Git</h2>
      </div>

      {!cwd ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          Start or select a session to inspect its repository.
        </div>
      ) : gitStatusError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {gitStatusError}
        </div>
      ) : isGitStatusLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading git status...
        </div>
      ) : !gitStatus?.isGitRepository ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          This directory is not inside a git repository.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <GitBranchSwitcher
                cwd={cwd}
                gitStatus={gitStatus}
                onBranchSwitched={onRefreshGitStatus}
                smokeBridge={smokeBridge}
              />
              {gitStatus.files.length === 0 ? (
                <span className="text-sm text-muted-foreground">Clean working tree</span>
              ) : (
                <div className="flex items-center gap-2 font-mono text-sm">
                  <span className="text-green-500">+{totalStats.additions}</span>
                  <span className="text-rose-500">-{totalStats.deletions}</span>
                </div>
              )}
            </div>
          </div>

          {gitStatus.files.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No modified, staged, or untracked files.
            </div>
          ) : isGitDiffLoading ? (
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
                {parsedEntries.map((entry, index) => {
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
                                {parent}
                              </span>
                              <span className="shrink-0 text-muted-foreground">/</span>
                            </>
                          ) : null}
                          <span className="shrink-0 text-foreground">{name}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-green-500">
                          +{stats.additions}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-rose-500">
                          -{stats.deletions}
                        </span>
                      </button>

                      {isCollapsed ? null : entry.parseError ? (
                        <div className="flex flex-col gap-3 p-3">
                          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                            {entry.parseError}
                          </div>
                          <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground">
                            {entry.text}
                          </pre>
                        </div>
                      ) : entry.parsedFiles.length > 0 ? (
                        entry.parsedFiles.map((file, fileIndex) => {
                          const fileLabel = getDiffFileLabel(file.oldPath, file.newPath);

                          return file.hunks.length > 0 ? (
                            <Diff
                              className={cn(
                                "git-diff-view git-diff-table git-diff-compact-gutter text-[11px]",
                              )}
                              diffType={file.type}
                              hunks={file.hunks}
                              key={`${file.oldRevision}-${file.newRevision}-${fileIndex}`}
                              optimizeSelection
                              renderGutter={renderCompactDiffGutter}
                              renderToken={renderDiffCodeToken(fileLabel)}
                              tokens={file.tokens}
                              viewType="unified"
                            >
                              {(hunks) =>
                                hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
                              }
                            </Diff>
                          ) : (
                            <div
                              className="border-t border-border bg-background px-3 py-3 text-xs text-muted-foreground"
                              key={`${file.oldRevision}-${file.newRevision}-${fileIndex}`}
                            >
                              {file.isBinary
                                ? "Binary patch metadata is available, but there are no text hunks to render."
                                : "This change does not contain line-level hunks to display."}
                            </div>
                          );
                        })
                      ) : entry.text.trim().length > 0 ? (
                        <div className="p-3">
                          <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground">
                            {entry.text}
                          </pre>
                        </div>
                      ) : (
                        <div className="border-t border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                          No line-level diff was returned for this file yet.
                        </div>
                      )}
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
