import React from "react";
import { Collapsible, CollapsibleTrigger } from "../../components/ui/collapsible.tsx";
import { Shimmer } from "../../components/ai-elements/shimmer.tsx";
import { ReasoningContent } from "../../components/ai-elements/reasoning.tsx";
import { cn } from "../../lib/utils.ts";

interface CompactReasoningProps {
  text: string;
  isActive: boolean;
  startedAt?: string;
  endedAt?: string;
  className?: string;
  defaultOpen?: boolean;
}

function getThoughtDurationSeconds(startedAt?: string, endedAt?: string): number | undefined {
  if (!startedAt || !endedAt) {
    return undefined;
  }
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return undefined;
  }
  return Math.max(1, Math.ceil((endMs - startMs) / 1000));
}

function formatThoughtLabel(seconds: number | undefined): string {
  return seconds === undefined ? "Thought" : `Thought for ${seconds}s`;
}

export function CompactReasoning({
  text,
  isActive,
  startedAt,
  endedAt,
  className,
  defaultOpen,
}: CompactReasoningProps): React.ReactNode {
  const durationSeconds = getThoughtDurationSeconds(startedAt, endedAt);

  return (
    <Collapsible
      className={cn("group/reasoning not-prose max-w-full", className)}
      defaultOpen={defaultOpen}
    >
      <CollapsibleTrigger className="block max-w-full rounded-sm text-left text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring">
        <span className="block min-w-0 truncate">
          {isActive ? <Shimmer as="span">Thinking</Shimmer> : formatThoughtLabel(durationSeconds)}
        </span>
      </CollapsibleTrigger>
      <ReasoningContent className="ml-4 mt-0 border-border/60 border-l py-2 pl-3">
        {text}
      </ReasoningContent>
    </Collapsible>
  );
}
