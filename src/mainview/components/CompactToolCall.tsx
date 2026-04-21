import React from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible.tsx";
import { cn } from "../../lib/utils.ts";
import { ToolInput, ToolOutput } from "../../components/ai-elements/tool.tsx";
import { Shimmer } from "../../components/ai-elements/shimmer.tsx";
import type { ChatToolCall } from "../chat/types.ts";

interface CompactToolCallProps {
  tool: ChatToolCall;
  className?: string;
  defaultOpen?: boolean;
}

function renderTitle(tool: ChatToolCall): React.ReactNode {
  const prefix = tool.shimmerPrefix;
  if (!prefix || !tool.title.startsWith(prefix)) {
    return tool.title;
  }

  return (
    <>
      <Shimmer as="span">{prefix}</Shimmer>
      {tool.title.slice(prefix.length)}
    </>
  );
}

export function CompactToolCall({
  tool,
  className,
  defaultOpen,
}: CompactToolCallProps): React.ReactNode {
  const hasDetails =
    tool.input !== undefined || tool.output !== undefined || tool.errorText !== undefined;

  return (
    <Collapsible
      className={cn("group/tool-call not-prose max-w-full", className)}
      defaultOpen={defaultOpen}
    >
      <CollapsibleTrigger
        className={cn(
          "block max-w-full rounded-sm text-left text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none",
        )}
        disabled={!hasDetails}
      >
        <span className="block min-w-0 truncate">{renderTitle(tool)}</span>
      </CollapsibleTrigger>
      {hasDetails ? (
        <CollapsibleContent className="ml-4 space-y-2 border-border/60 border-l py-2 pl-3">
          {tool.input !== undefined ? <ToolInput className="text-xs" input={tool.input} /> : null}
          {tool.output !== undefined || tool.errorText ? (
            <ToolOutput className="text-xs" errorText={tool.errorText} output={tool.output} />
          ) : null}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
