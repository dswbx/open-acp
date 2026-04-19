import React from "react";
import { Diff, Hunk, markEdits, parseDiff, tokenize } from "react-diff-view";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SmokeBridge } from "../bridge/SmokeBridge.ts";
import type {
   GetGitStatusResult,
   GitStatusFile,
} from "../../shared/AppRPC.ts";

interface GitPanelProps {
   cwd?: string;
   gitStatus?: GetGitStatusResult;
   gitStatusError?: string;
   isGitStatusLoading: boolean;
   smokeBridge: SmokeBridge;
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

function formatDiffType(type: string): string {
   switch (type) {
      case "add":
         return "Added";
      case "delete":
         return "Deleted";
      case "rename":
         return "Renamed";
      case "copy":
         return "Copied";
      default:
         return "Modified";
   }
}

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
   return file.originalPath
      ? getDiffFileLabel(file.originalPath, file.path)
      : file.path;
}

function getStatusBadgeLabel(file: GitStatusFile): string {
   if (
      file.indexStatus === "untracked" ||
      file.workingTreeStatus === "untracked"
   ) {
      return "Added";
   }
   if (
      file.indexStatus === "deleted" ||
      file.workingTreeStatus === "deleted"
   ) {
      return "Deleted";
   }
   if (
      file.indexStatus === "renamed" ||
      file.workingTreeStatus === "renamed"
   ) {
      return "Renamed";
   }
   if (
      file.indexStatus === "copied" ||
      file.workingTreeStatus === "copied"
   ) {
      return "Copied";
   }
   return "Modified";
}

function getStatusBadgeVariant(file: GitStatusFile): "outline" | "destructive" {
   return file.indexStatus === "deleted" || file.workingTreeStatus === "deleted"
      ? "destructive"
      : "outline";
}

function summarizeDiffFiles(files: ParsedDiffFile[]): string {
   let additions = 0;
   let deletions = 0;
   let hasBinary = false;

   for (const file of files) {
      if (file.isBinary) {
         hasBinary = true;
      }
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

   if (hasBinary && additions === 0 && deletions === 0) {
      return "Binary file";
   }

   const parts: string[] = [];
   if (additions > 0) {
      parts.push(`${additions} addition${additions === 1 ? "" : "s"}`);
   }
   if (deletions > 0) {
      parts.push(`${deletions} deletion${deletions === 1 ? "" : "s"}`);
   }
   if (hasBinary) {
      parts.push("binary");
   }
   return parts.join(" · ") || "Metadata-only change";
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
}: GitPanelProps): React.ReactNode {
   const [gitDiffByFileKey, setGitDiffByFileKey] = React.useState<
      Record<string, string | undefined>
   >({});
   const [gitDiffError, setGitDiffError] = React.useState<string>();
   const [isGitDiffLoading, setIsGitDiffLoading] = React.useState(false);
   const latestRequestId = React.useRef(0);

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
            smokeBridge.getGitFileDiff(
               trimmedCwd,
               file.path,
               file.originalPath,
            ),
         ),
      )
         .then((results) => {
            if (latestRequestId.current !== requestId) {
               return;
            }
            setGitDiffByFileKey(
               Object.fromEntries(
                  results.map((entry) => [
                     getStatusFileKey(entry),
                     entry.text,
                  ]),
               ),
            );
            setGitDiffError(undefined);
            setIsGitDiffLoading(false);
         })
         .catch((error) => {
            if (latestRequestId.current !== requestId) {
               return;
            }
            setGitDiffByFileKey({});
            setGitDiffError(
               error instanceof Error ? error.message : "Failed to load git diff.",
            );
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
               parseError:
                  error instanceof Error
                     ? error.message
                     : "Failed to parse git diff.",
            };
         }
      });
   }, [gitDiffByFileKey, gitStatus]);

   return (
      <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-4 shadow-sm">
         <div className="mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
               Git
            </h2>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
               {cwd ?? "No active session"}
            </p>
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
                     <Badge variant="outline">
                        {gitStatus.branch ?? `detached @ ${gitStatus.head ?? "HEAD"}`}
                     </Badge>
                     <span className="text-sm text-muted-foreground">
                        {gitStatus.files.length === 0
                           ? "Clean working tree"
                           : `${gitStatus.files.length} changed file${gitStatus.files.length === 1 ? "" : "s"}`}
                     </span>
                     {gitStatus.summary.staged > 0 ? (
                        <Badge variant="secondary">
                           {gitStatus.summary.staged} staged
                        </Badge>
                     ) : null}
                     {gitStatus.summary.unstaged > 0 ? (
                        <Badge variant="secondary">
                           {gitStatus.summary.unstaged} unstaged
                        </Badge>
                     ) : null}
                     {gitStatus.summary.untracked > 0 ? (
                        <Badge variant="secondary">
                           {gitStatus.summary.untracked} untracked
                        </Badge>
                     ) : null}
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
                  <ScrollArea className="min-h-0 flex-1 rounded-md border border-border bg-muted/15">
                     <div className="chat-selectable flex flex-col gap-3 p-3">
                        {parsedEntries.map((entry, index) => (
                           <section
                              className="overflow-hidden rounded-md border border-border bg-background shadow-sm"
                              key={`${getStatusFileKey(entry.statusFile)}-${index}`}
                           >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                                 <div className="min-w-0">
                                    <div className="truncate font-mono text-xs text-foreground">
                                       {getStatusFileLabel(entry.statusFile)}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                       {entry.parsedFiles.length > 0
                                          ? summarizeDiffFiles(entry.parsedFiles)
                                          : entry.statusFile.summary}
                                    </div>
                                 </div>
                                 <Badge
                                    className="font-mono"
                                    variant={
                                       entry.parsedFiles[0]
                                          ? entry.parsedFiles[0].type === "delete"
                                             ? "destructive"
                                             : "outline"
                                          : getStatusBadgeVariant(entry.statusFile)
                                    }
                                 >
                                    {entry.parsedFiles[0]
                                       ? formatDiffType(entry.parsedFiles[0].type)
                                       : getStatusBadgeLabel(entry.statusFile)}
                                 </Badge>
                              </div>

                              {entry.parseError ? (
                                 <div className="flex flex-col gap-3 p-3">
                                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                       {entry.parseError}
                                    </div>
                                    <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground">
                                       {entry.text}
                                    </pre>
                                 </div>
                              ) : entry.parsedFiles.length > 0 ? (
                                 entry.parsedFiles.map((file, fileIndex) =>
                                    file.hunks.length > 0 ? (
                                       <Diff
                                          className={cn(
                                             "git-diff-view git-diff-table text-[11px]",
                                          )}
                                          diffType={file.type}
                                          hunks={file.hunks}
                                          key={`${file.oldRevision}-${file.newRevision}-${fileIndex}`}
                                          optimizeSelection
                                          tokens={file.tokens}
                                          viewType="unified"
                                       >
                                          {(hunks) =>
                                             hunks.map((hunk) => (
                                                <Hunk
                                                   key={hunk.content}
                                                   hunk={hunk}
                                                />
                                             ))
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
                                    ),
                                 )
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
                        ))}
                     </div>
                  </ScrollArea>
               )}
            </div>
         )}
      </section>
   );
}
