import type { PlanReviewSource } from "./AppRPC.ts";

const PROPOSED_PLAN_PATTERN = /<proposed_plan>([\s\S]*?)<\/proposed_plan>/i;

export interface PlanReviewContent {
  planText: string;
  source: Exclude<PlanReviewSource, "native_switch_mode">;
}

export function extractPlanReviewContent(text: string): PlanReviewContent | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const proposedPlanMatch = trimmed.match(PROPOSED_PLAN_PATTERN);
  const proposedPlanText = proposedPlanMatch?.[1]?.trim();
  if (proposedPlanText) {
    return {
      planText: proposedPlanText,
      source: "proposed_plan_block",
    };
  }

  return {
    planText: trimmed,
    source: "assistant_message",
  };
}

export function formatStructuredPlanEntries(
  entries: ReadonlyArray<{
    content: string;
    priority: string;
    status: string;
  }>,
): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  return entries
    .map((entry, index) => {
      const priorityLabel = entry.priority === "medium" ? "" : ` (${entry.priority})`;
      return `${index + 1}. [${entry.status}] ${entry.content}${priorityLabel}`;
    })
    .join("\n");
}
