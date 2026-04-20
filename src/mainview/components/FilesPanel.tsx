import React from "react";
import { FileCode2, Folder, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SessionDirectoryEntry } from "../../shared/AppRPC.ts";

interface FilesPanelProps {
  cwd?: string;
  entries: readonly SessionDirectoryEntry[];
  isLoading: boolean;
  error?: string;
  onRefresh?: () => void;
}

export function FilesPanel({
  cwd,
  entries,
  isLoading,
  error,
  onRefresh,
}: FilesPanelProps): React.ReactNode {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Files
          </h2>
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {cwd ?? "No active session"}
          </p>
        </div>
        <Button
          aria-label="Refresh files"
          disabled={!cwd || isLoading}
          onClick={onRefresh}
          size="icon-xs"
          title="Refresh files"
          variant="ghost"
        >
          <RefreshCw className={isLoading ? "animate-spin" : undefined} />
        </Button>
      </div>

      {!cwd ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          Start or select a session to inspect its working directory.
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading directory contents...
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          This directory is empty.
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 rounded-md border border-border bg-muted/30">
          <ul className="space-y-1 p-2">
            {entries.map((entry) => {
              const Icon = entry.kind === "directory" ? Folder : FileCode2;
              return (
                <li
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-card-foreground hover:bg-accent/60"
                  key={entry.path}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{entry.name}</span>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}
