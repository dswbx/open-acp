import React from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible.tsx";
import { cn } from "../../lib/utils.ts";
import { ToolInput, ToolOutput } from "../../components/ai-elements/tool.tsx";
import { Shimmer } from "../../components/ai-elements/shimmer.tsx";
import { GitDiffContent } from "../features/git/components/GitDiffContent.tsx";
import type { ChatToolCall } from "../chat/types.ts";

interface CompactToolCallProps {
  tool: ChatToolCall;
  className?: string;
  defaultOpen?: boolean;
  onUserToggle?: () => void;
}

function renderTitle(tool: ChatToolCall): React.ReactNode {
  if (tool.fileChange) {
    const isActive = tool.shimmerPrefix === tool.fileChange.verb;
    return (
      <span className="inline-flex max-w-full min-w-0 items-baseline gap-1.5">
        {isActive ? <Shimmer as="span">{tool.fileChange.verb}</Shimmer> : tool.fileChange.verb}
        <span className="min-w-0 truncate text-tool-call-accent">{tool.fileChange.target}</span>
        {!isActive ? (
          <span className="shrink-0 font-mono">
            <span className="text-green-500">+{tool.fileChange.additions}</span>
            <span className="ml-1 text-rose-500">-{tool.fileChange.deletions}</span>
          </span>
        ) : null}
      </span>
    );
  }

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
  onUserToggle,
}: CompactToolCallProps): React.ReactNode {
  const hasDetails = tool.fileChange
    ? tool.fileChange.diffText.length > 0
    : tool.input !== undefined || tool.output !== undefined || tool.errorText !== undefined;

  return (
    <Collapsible
      className={cn("chat-selectable group/tool-call not-prose max-w-full", className)}
      defaultOpen={defaultOpen}
      onOpenChange={onUserToggle}
    >
      <CollapsibleTrigger
        className={cn(
          "block max-w-full cursor-pointer rounded-sm text-left text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-text",
        )}
        data-chat-interactive-trigger="tool-call"
        disabled={!hasDetails}
      >
        <span className="block min-w-0 truncate">{renderTitle(tool)}</span>
      </CollapsibleTrigger>
      {hasDetails ? (
        <CollapsibleContent
          className={cn(
            "space-y-2 py-2",
            !tool.fileChange && "ml-4 border-border/60 border-l pl-3",
          )}
        >
          {tool.fileChange?.diffText ? (
            <div className="max-h-80 overflow-auto rounded-md border border-border bg-muted/15">
              <GitDiffContent gutterMode="full" showFileHeaders text={tool.fileChange.diffText} />
            </div>
          ) : (
            <>
              {tool.input !== undefined ? (
                <ToolInput className="text-sm" input={tool.input} />
              ) : null}
              {tool.output !== undefined || tool.errorText ? (
                <ToolOutput className="text-sm" errorText={tool.errorText} output={tool.output} />
              ) : null}
            </>
          )}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
