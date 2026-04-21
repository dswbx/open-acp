import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Info, Search } from "lucide-react";
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
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Session inspector
        </h2>
        <Button
          aria-expanded={isInfoOpen}
          onClick={() => setIsInfoOpen((value) => !value)}
          size="sm"
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

      <div className="mb-4 flex gap-2">
        <Button disabled={!props.canStop} onClick={props.onStop} type="button" variant="outline">
          {props.isStopping ? "Stopping..." : "Stop"}
        </Button>
        <Button disabled={!props.canRetry} onClick={props.onRetry} type="button" variant="outline">
          Retry
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 basis-0 flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            ACP transcript
          </h3>
          {normalizedTranscriptQuery ? (
            <span className="text-xs text-muted-foreground">
              {visibleTranscriptEntries.length} of {props.transcriptEntries.length}
            </span>
          ) : null}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search ACP transcript"
            className="pl-8"
            onChange={(event) => setTranscriptQuery(event.currentTarget.value)}
            placeholder="Search transcript"
            type="search"
            value={transcriptQuery}
          />
        </div>

        <div className="chat-selectable min-h-0 flex-1 basis-0 overflow-auto rounded-md border border-border bg-muted/40 p-2">
          {!hasTranscriptEntries ? (
            <p className="chat-selectable text-xs text-muted-foreground">
              No request/response traffic recorded yet.
            </p>
          ) : !hasVisibleTranscriptEntries ? (
            <p className="chat-selectable text-xs text-muted-foreground">
              No transcript entries match this search.
            </p>
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
    </section>
  );
}
