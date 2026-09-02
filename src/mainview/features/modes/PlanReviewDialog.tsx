import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PlanReviewEventPayload } from "../../../shared/AppRPC.ts";

type PendingPlanReview = Extract<PlanReviewEventPayload, { kind: "requested" }>;

interface PlanReviewDialogProps {
  review?: PendingPlanReview;
  feedback: string;
  isResponding: boolean;
  onFeedbackChange: (feedback: string) => void;
  onCancel: () => void;
  onStartBuild: () => void;
  onRevise: () => void;
}

export function PlanReviewDialog({
  review,
  feedback,
  isResponding,
  onFeedbackChange,
  onCancel,
  onStartBuild,
  onRevise,
}: PlanReviewDialogProps): React.ReactNode {
  if (!review) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section
        aria-labelledby="plan-review-dialog-title"
        aria-modal="true"
        className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl"
        data-testid="plan-review-dialog"
        role="dialog"
      >
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Plan review
            </p>
            <h2
              className="text-lg font-semibold text-card-foreground"
              id="plan-review-dialog-title"
            >
              Review the proposed plan before switching back to build
            </h2>
            <p className="text-muted-foreground">
              Start build to continue, cancel to stay in plan mode, or tell the agent what to
              change.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Proposed plan
            </div>
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 whitespace-pre-wrap">
              {review.planText}
            </pre>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Tell It What To Do Differently
            </span>
            <Textarea
              disabled={isResponding}
              onChange={(event) => onFeedbackChange(event.target.value)}
              placeholder="Adjust the plan before we switch back to build."
              rows={4}
              value={feedback}
            />
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/30 px-5 py-4">
          <Button disabled={isResponding} onClick={onCancel} type="button" variant="outline">
            {isResponding ? "Working..." : "Cancel"}
          </Button>
          <Button
            disabled={isResponding || feedback.trim().length === 0}
            onClick={onRevise}
            type="button"
            variant="outline"
          >
            {isResponding ? "Working..." : "Tell it what to do differently"}
          </Button>
          <Button disabled={isResponding} onClick={onStartBuild} type="button">
            {isResponding ? "Working..." : "Start build"}
          </Button>
        </div>
      </section>
    </div>
  );
}
