import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Info, RotateCcw, Search, Square } from "lucide-react";
import type { AgentTranscriptEventPayload } from "../../shared/AppRPC.ts";

interface InspectorPanelProps {
  modelName: string;
  contextWindow: string;
  activeRequestId?: string;
  isWorking: boolean;
  isStopping: boolean;
  canRetry: boolean;
  canStop: boolean;
  pendingApprovalCount: number;
  transcriptEntries: readonly AgentTranscriptEventPayload[];
  onStop: () => void;
  onRetry: () => void;
}

function transcriptEntryMatchesQuery(entry: AgentTranscriptEventPayload, query: string): boolean {
  const searchableText = [
    entry.direction,
    entry.kind,
    entry.method,
    entry.summary,
    entry.requestId === undefined ? undefined : String(entry.requestId),
    entry.json,
  ]
    .filter((value): value is string => value !== undefined)
    .join("\n")
    .toLowerCase();

  return searchableText.includes(query);
}

export function InspectorPanel(props: InspectorPanelProps): React.ReactNode {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const normalizedTranscriptQuery = transcriptQuery.trim().toLowerCase();
  const statusLabel = props.isStopping ? "stopping" : props.isWorking ? "working" : "idle";
  const visibleTranscriptEntries = useMemo(() => {
    if (!normalizedTranscriptQuery) {
      return props.transcriptEntries;
    }

    return props.transcriptEntries.filter((entry) =>
      transcriptEntryMatchesQuery(entry, normalizedTranscriptQuery),
    );
  }, [normalizedTranscriptQuery, props.transcriptEntries]);
  const hasTranscriptEntries = props.transcriptEntries.length > 0;
  const hasVisibleTranscriptEntries = visibleTranscriptEntries.length > 0;

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-1 pb-2">
      <h2 className="sr-only">Session inspector</h2>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            disabled={!props.canStop || props.isStopping}
            onClick={props.onStop}
            type="button"
            size="xs"
            variant={props.canStop ? "destructive" : "outline"}
          >
            <Square /> Stop
          </Button>
          <Button
            disabled={!props.canRetry}
            onClick={props.onRetry}
            type="button"
            size="xs"
            variant="outline"
          >
            <RotateCcw /> Retry
          </Button>
        </div>
        <Button
          aria-expanded={isInfoOpen}
          onClick={() => setIsInfoOpen((value) => !value)}
          size="xs"
          type="button"
          variant="outline"
        >
          <Info />
          Info
          <ChevronDown
            className={isInfoOpen ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </Button>
      </div>

      {isInfoOpen ? (
        <dl className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="truncate text-right font-medium text-card-foreground">
              {props.modelName}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Context</dt>
            <dd className="text-right font-medium text-card-foreground">{props.contextWindow}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium text-card-foreground">{statusLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Pending approvals</dt>
            <dd className="text-right font-medium text-card-foreground">
              {props.pendingApprovalCount}
            </dd>
          </div>
          {props.activeRequestId ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Request</dt>
              <dd className="max-w-[12rem] truncate text-right font-medium text-card-foreground">
                {props.activeRequestId.slice(0, 12)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="flex min-h-0 flex-1 basis-0 flex-col gap-3">
        <div className="flex flex-col min-h-0 flex-1 basis-0">
          <h3 className="sr-only">ACP transcript</h3>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search ACP transcript"
              className="pl-8 rounded-b-none border-border"
              onChange={(event) => setTranscriptQuery(event.currentTarget.value)}
              placeholder="Search transcript"
              type="search"
              value={transcriptQuery}
            />

            {normalizedTranscriptQuery ? (
              <div className="absolute right-8 top-0 bottom-0 flex items-center justify-center">
                <span className="text-xs text-muted-foreground opacity-50">
                  {visibleTranscriptEntries.length} of {props.transcriptEntries.length}
                </span>
              </div>
            ) : null}
          </div>

          <div className="chat-selectable min-h-0 flex-1 basis-0 overflow-auto rounded-b-md border border-border border-t-0 p-2">
            {!hasTranscriptEntries ? (
              <div className="flex flex-1 h-full items-center justify-center chat-selectable text-xs opacity-30">
                No request/response traffic recorded yet.
              </div>
            ) : !hasVisibleTranscriptEntries ? (
              <div className="flex flex-1 h-full items-center justify-center chat-selectable text-xs opacity-30">
                No transcript entries match this search.
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleTranscriptEntries.map((entry) => (
                  <li
                    className="chat-selectable rounded-md border border-border bg-card p-2"
                    key={entry.entryId}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <span>{entry.direction}</span>
                      <span>&middot;</span>
                      <span>{entry.kind}</span>
                      <span>&middot;</span>
                      <span>{entry.method ?? entry.summary}</span>
                      {entry.requestId !== undefined ? (
                        <>
                          <span>&middot;</span>
                          <span>id {String(entry.requestId)}</span>
                        </>
                      ) : null}
                    </div>
                    <pre className="chat-selectable overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-card-foreground">
                      {entry.json}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
