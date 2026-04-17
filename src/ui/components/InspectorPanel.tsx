import React from "react";
import type { AgentTranscriptEventPayload } from "../../shared/AppRPC.ts";
import { PrimaryButton } from "./ui/PrimaryButton.tsx";

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

export class InspectorPanel extends React.Component<InspectorPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Session inspector
        </h2>
        <dl className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-medium text-card-foreground">{this.props.modelName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Context</dt>
            <dd className="font-medium text-card-foreground">
              {this.props.contextWindow}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium text-card-foreground">
              {this.props.isStopping
                ? "stopping"
                : this.props.isWorking
                  ? "working"
                  : "idle"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Pending approvals</dt>
            <dd className="text-right font-medium text-card-foreground">
              {this.props.pendingApprovalCount}
            </dd>
          </div>
          {this.props.activeRequestId ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Request</dt>
              <dd className="max-w-[12rem] truncate text-right font-medium text-card-foreground">
                {this.props.activeRequestId.slice(0, 12)}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mb-4 flex gap-2">
          <PrimaryButton
            disabled={!this.props.canStop}
            label={this.props.isStopping ? "Stopping..." : "Stop"}
            onClick={this.props.onStop}
          />
          <PrimaryButton
            disabled={!this.props.canRetry}
            label="Retry"
            onClick={this.props.onRetry}
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            ACP transcript
          </h3>
          <div className="max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-2">
            {this.props.transcriptEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No request/response traffic recorded yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {this.props.transcriptEntries.map((entry) => (
                  <li
                    className="rounded-md border border-border bg-card p-2"
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
                    <pre className="overflow-auto text-xs leading-relaxed text-card-foreground whitespace-pre-wrap">
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
}
