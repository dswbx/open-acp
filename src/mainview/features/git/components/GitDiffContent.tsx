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
import { getCodeLanguageForPath } from "@/components/ai-elements/code-rendering";
import { CodeTokenSpan, highlightCode } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";

export type ParsedGitDiffFile = ReturnType<typeof parseDiff>[number] & {
  tokens: ReturnType<typeof tokenize> | null;
};

export interface GitDiffStats {
  additions: number;
  deletions: number;
}

interface GitDiffWidgets {
  widgets: Record<string, React.ReactNode>;
  collapsedLabels: string[];
}

interface GitDiffContentProps {
  className?: string;
  gutterMode?: "compact" | "full";
  parsedFiles?: ParsedGitDiffFile[];
  showFileHeaders?: boolean;
  text?: string;
}

const renderUnifiedLineNumberGutter: RenderGutter = ({ change, side, wrapInAnchor }) => {
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

export function getDiffFileLabel(oldPath: string, newPath: string): string {
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

export function getDiffStats(files: ParsedGitDiffFile[]): GitDiffStats {
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

export function parseGitDiffText(text: string): ParsedGitDiffFile[] {
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

function buildDiffWidgets(files: ParsedGitDiffFile[]): GitDiffWidgets {
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

function getMaxLineNumberDigits(file: ParsedGitDiffFile): number {
  let maxLineNumber = 1;

  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (change.type === "normal") {
        maxLineNumber = Math.max(maxLineNumber, change.oldLineNumber, change.newLineNumber);
        continue;
      }
      maxLineNumber = Math.max(maxLineNumber, change.lineNumber);
    }
  }

  return maxLineNumber.toString().length;
}

export function GitDiffContent({
  className,
  gutterMode = "compact",
  parsedFiles: providedParsedFiles,
  showFileHeaders = false,
  text,
}: GitDiffContentProps): React.ReactNode {
  const parsedFromText = React.useMemo(() => {
    if (!text || providedParsedFiles) {
      return undefined;
    }
    return parseGitDiffText(text);
  }, [providedParsedFiles, text]);
  const parsedFiles = providedParsedFiles ?? parsedFromText ?? [];

  if (parsedFiles.length === 0) {
    return (
      <div className="border-border border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        No textual diff available.
      </div>
    );
  }

  return (
    <div className={cn("chat-selectable flex flex-col", className)}>
      {parsedFiles.map((file, fileIndex) => {
        const fileLabel = getDiffFileLabel(file.oldPath, file.newPath);
        const fileStats = getDiffStats([file]);
        const { widgets } = buildDiffWidgets([file]);
        const gutterDigits = getMaxLineNumberDigits(file);

        return (
          <div
            data-git-diff-file={fileLabel}
            data-git-diff-view="unified"
            key={`${file.oldRevision}-${file.newRevision}-${fileIndex}`}
            style={{ "--git-diff-gutter-digits": gutterDigits } as React.CSSProperties}
          >
            {showFileHeaders ? (
              <div className="flex min-w-0 items-center gap-2 border-border border-b bg-muted/40 px-3 py-1.5 text-[11px]">
                <span className="min-w-0 truncate font-medium text-foreground">{fileLabel}</span>
                <span className="shrink-0 font-mono">
                  <span className="text-green-500">+{fileStats.additions}</span>
                  <span className="ml-1 text-rose-500">-{fileStats.deletions}</span>
                </span>
              </div>
            ) : null}
            <Diff
              className={cn(
                "git-diff-view git-diff-table text-[11px]",
                gutterMode === "compact" && "git-diff-compact-gutter",
                gutterMode === "full" && "git-diff-auto-gutter",
              )}
              diffType={file.type}
              hunks={file.hunks}
              optimizeSelection
              renderGutter={
                gutterMode === "compact" || gutterMode === "full"
                  ? renderUnifiedLineNumberGutter
                  : undefined
              }
              renderToken={renderDiffCodeToken(fileLabel)}
              tokens={file.tokens}
              viewType="unified"
              widgets={widgets}
            >
              {(hunks) => hunks.map((hunk) => <Hunk hunk={hunk} key={hunk.content} />)}
            </Diff>
          </div>
        );
      })}
    </div>
  );
}
