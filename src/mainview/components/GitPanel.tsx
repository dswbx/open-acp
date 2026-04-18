import React from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GetGitStatusResult } from "../../shared/AppRPC.ts";

interface GitPanelProps {
   cwd?: string;
   gitStatus?: GetGitStatusResult;
   gitStatusError?: string;
   isGitStatusLoading: boolean;
}

export function GitPanel({
   cwd,
   gitStatus,
   gitStatusError,
   isGitStatusLoading,
}: GitPanelProps): React.ReactNode {
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
                  </div>
               </div>

               {gitStatus.files.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                     No modified, staged, or untracked files.
                  </div>
               ) : (
                  <ScrollArea className="min-h-0 flex-1 rounded-md border border-border bg-muted/30">
                     <ul className="space-y-1 p-2">
                        {gitStatus.files.map((file) => (
                           <li
                              className="rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
                              key={`${file.path}-${file.summary}`}
                           >
                              <div className="truncate font-medium text-card-foreground">
                                 {file.path}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                 {file.summary}
                              </div>
                           </li>
                        ))}
                     </ul>
                  </ScrollArea>
               )}
            </div>
         )}
      </section>
   );
}
