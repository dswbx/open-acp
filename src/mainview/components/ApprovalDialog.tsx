import React from "react";
import { Button } from "../../components/ui/button.tsx";
import type { ApprovalEventPayload } from "../../shared/AppRPC.ts";
import {
  formatToolPresentation,
  toToolActionLabel,
} from "../chat/toolPresentation.ts";

type PendingApproval = Extract<ApprovalEventPayload, { kind: "requested" }>;

interface ApprovalDialogProps {
  approval?: PendingApproval;
  isResponding: boolean;
  onSelectOption: (optionId: string) => void;
}

function getOptionVariant(
  kind: PendingApproval["options"][number]["kind"]
): "default" | "outline" | "destructive" {
  if (kind === "allow_once" || kind === "allow_always") {
    return "default";
  }
  return kind === "reject_always" ? "destructive" : "outline";
}

export const ApprovalDialog = ({
  approval,
  isResponding,
  onSelectOption
}: ApprovalDialogProps): React.ReactNode => {
  if (!approval) {
    return null;
  }

  const title = `Approval required to ${toToolActionLabel(
    formatToolPresentation({
      toolCallId: approval.toolCallId,
      toolKind: approval.toolKind,
      input: approval.rawInput,
      locations: approval.locations,
    }).title
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section
        aria-labelledby="approval-dialog-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl"
        role="dialog"
      >
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agent approval
            </p>
            <h2 className="text-lg font-semibold text-card-foreground" id="approval-dialog-title">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">
              The agent requested permission before continuing this tool call.
            </p>
          </div>

          {approval.rawInput ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Requested input
              </div>
              <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground whitespace-pre-wrap">
                {approval.rawInput}
              </pre>
            </div>
          ) : null}

          {approval.locations.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Affected locations
              </div>
              <ul className="space-y-1 text-sm text-foreground">
                {approval.locations.map((location) => (
                  <li key={`${location.path}:${location.line ?? "none"}`}>
                    {location.path}
                    {typeof location.line === "number" ? `:${location.line}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/30 px-5 py-4">
          {approval.options.map((option) => (
            <Button
              disabled={isResponding}
              key={option.optionId}
              onClick={() => {
                onSelectOption(option.optionId);
              }}
              variant={getOptionVariant(option.kind)}
            >
              {isResponding ? "Working..." : option.name}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
};
