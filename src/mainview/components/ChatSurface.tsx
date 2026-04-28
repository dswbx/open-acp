import React from "react";
import { cn } from "@/lib/utils";
import { ConversationEmptyState } from "../../components/ai-elements/conversation.tsx";
import { Message, MessageContent, MessageResponse } from "../../components/ai-elements/message.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible.tsx";
import { ScrollArea } from "../../components/ui/scroll-area.tsx";
import { Shimmer } from "../../components/ai-elements/shimmer.tsx";
import { Spinner } from "../../components/ui/spinner.tsx";
import {
  firstTrailingTextIndex,
  mapChatMessagesToSurface,
  type ChatSurfaceBlock,
} from "../chat/chatSurfaceModel.ts";
import type { ChatMessage } from "../chat/types.ts";
import { CompactReasoning } from "./CompactReasoning.tsx";
import { CompactToolCall } from "./CompactToolCall.tsx";
import { ArrowDownIcon, ChevronRightIcon } from "lucide-react";
import { useStickToBottom } from "use-stick-to-bottom";

interface ChatSurfaceProps {
  messages: readonly ChatMessage[];
  contentClassName?: string;
  scrollButtonClassName?: string;
}

function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function TurnTimer({
  startIso,
  isActive,
}: {
  startIso: string;
  isActive: boolean;
}): React.ReactNode {
  const [startMs] = React.useState(() => {
    const parsed = new Date(startIso).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  });
  const [everActive, setEverActive] = React.useState(isActive);
  const [frozenMs, setFrozenMs] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (isActive) {
      setEverActive(true);
      setFrozenMs(null);
      setNow(Date.now());
      const id = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(id);
    }
    setFrozenMs((prev) => (prev === null ? Math.max(0, Date.now() - startMs) : prev));
    return undefined;
  }, [isActive, startMs]);

  if (!everActive) return null;

  const elapsedMs = frozenMs ?? Math.max(0, now - startMs);
  const totalSeconds = Math.floor(elapsedMs / 1000);

  return (
    <div className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
      {isActive ? <Spinner className="size-3" /> : null}
      <span className="tabular-nums">{formatElapsed(totalSeconds)}</span>
    </div>
  );
}

function CompactReasoningSteps({
  block,
}: {
  block: Extract<ChatSurfaceBlock, { kind: "reasoning-steps" }>;
}): React.ReactNode {
  const title = block.steps.length === 1 ? block.steps[0]?.label : `${block.steps.length} updates`;
  const hasDetails = block.steps.some((step) => step.description);

  return (
    <Collapsible className="chat-selectable group/reasoning-steps not-prose max-w-full">
      <CollapsibleTrigger
        className="block max-w-full rounded-sm text-left text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none"
        disabled={!hasDetails}
      >
        <span className="block min-w-0 truncate">
          {block.isActive ? (
            <Shimmer as="span" className="text-sm" duration={1.2}>
              {title}
            </Shimmer>
          ) : (
            title
          )}
        </span>
      </CollapsibleTrigger>
      {hasDetails ? (
        <CollapsibleContent className="space-y-2 py-2 text-xs text-muted-foreground">
          {block.steps.map((step) => (
            <div className="min-w-0" key={step.id}>
              {block.steps.length > 1 ? (
                <div className="font-medium text-foreground">{step.label}</div>
              ) : null}
              {step.description ? (
                <div className="whitespace-pre-wrap">{step.description}</div>
              ) : null}
            </div>
          ))}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function CollapsedTurnSummary({
  blocks,
  elapsedSeconds,
}: {
  blocks: readonly ChatSurfaceBlock[];
  elapsedSeconds: number | null;
}): React.ReactNode {
  const stepLabel = blocks.length === 1 ? "1 step" : `${blocks.length} steps`;
  const elapsedLabel =
    elapsedSeconds !== null && elapsedSeconds >= 0 ? formatElapsed(elapsedSeconds) : null;
  const triggerText = elapsedLabel
    ? `Worked for ${elapsedLabel} · ${stepLabel}`
    : `Worked · ${stepLabel}`;

  return (
    <Collapsible className="chat-selectable group/turn-summary not-prose max-w-full">
      <CollapsibleTrigger className="inline-flex items-center gap-1.5 rounded-sm text-left text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring">
        <ChevronRightIcon className="size-3 shrink-0 transition-transform duration-150 group-data-open/turn-summary:rotate-90" />
        <span className="tabular-nums">{triggerText}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 flex flex-col gap-4 border-l border-border/60 pl-3">
        {blocks.map((block) => renderBlock(block))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function computeTurnElapsedSeconds(item: {
  turnStartedAt?: string;
  turnEndedAt?: string;
  timestamp: string;
}): number | null {
  const startSource = item.turnStartedAt ?? item.timestamp;
  const endSource = item.turnEndedAt ?? item.timestamp;
  const startMs = new Date(startSource).getTime();
  const endMs = new Date(endSource).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

function renderBlock(block: ChatSurfaceBlock): React.ReactNode {
  switch (block.kind) {
    case "reasoning":
      return (
        <CompactReasoning
          endedAt={block.endedAt}
          isActive={block.isActive}
          key={block.id}
          startedAt={block.startedAt}
          text={block.text}
        />
      );
    case "text":
      return (
        <MessageResponse className="chat-selectable" key={block.id}>
          {block.text}
        </MessageResponse>
      );
    case "tool": {
      const tool = block.tool;
      return <CompactToolCall key={block.id} tool={tool} />;
    }
    case "reasoning-steps":
      return <CompactReasoningSteps block={block} key={block.id} />;
  }
}

export const ChatSurface = ({
  messages,
  contentClassName,
  scrollButtonClassName,
}: ChatSurfaceProps): React.ReactNode => {
  const items = mapChatMessagesToSurface(messages);
  const { contentRef, isAtBottom, scrollRef, scrollToBottom } = useStickToBottom({
    initial: "smooth",
    resize: "smooth",
  });

  return (
    <div className="chat-selectable chat-surface relative min-h-0 flex-1">
      <ScrollArea
        className="h-full"
        role="log"
        viewportClassName="size-full [scrollbar-gutter:stable_both-edges]"
        viewportRef={scrollRef}
      >
        <div
          ref={contentRef}
          className={cn(
            "mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-7 pb-32 pt-8",
            contentClassName,
          )}
        >
          {items.length === 0 ? (
            <ConversationEmptyState
              description="Send a message to begin."
              title="No chat messages yet"
            />
          ) : (
            items.map((item) => (
              <Message className="chat-selectable" from={item.from} key={item.id}>
                {/* {item.from === "assistant" ? (
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium uppercase">{item.authorLabel}</span>
                    <span>·</span>
                    <span className="uppercase">{item.providerLabel}</span>
                    {item.model ? (
                      <>
                        <span>·</span>
                        <span>{item.model}</span>
                      </>
                    ) : null}
                  </div>
                ) : null} */}
                <MessageContent
                  className={cn(
                    "gap-4",
                    item.isError ? "chat-selectable text-destructive" : "chat-selectable",
                  )}
                >
                  {item.from === "assistant" ? (
                    (() => {
                      const hasTextBlock = item.blocks.some((block) => block.kind === "text");
                      const splitIndex = firstTrailingTextIndex(item.blocks);
                      const shouldCollapse = !item.isStreaming && splitIndex > 5;
                      const intermediateBlocks = shouldCollapse
                        ? item.blocks.slice(0, splitIndex)
                        : [];
                      const trailingBlocks = shouldCollapse
                        ? item.blocks.slice(splitIndex)
                        : item.blocks;
                      const elapsedSeconds = shouldCollapse
                        ? computeTurnElapsedSeconds(item)
                        : null;
                      return (
                        <>
                          {shouldCollapse ? (
                            <CollapsedTurnSummary
                              blocks={intermediateBlocks}
                              elapsedSeconds={elapsedSeconds}
                            />
                          ) : null}
                          {trailingBlocks.map((block) => renderBlock(block))}
                          {!hasTextBlock && item.text.length > 0 ? (
                            <MessageResponse className="chat-selectable">
                              {item.text}
                            </MessageResponse>
                          ) : null}
                          <TurnTimer
                            isActive={item.isStreaming}
                            startIso={item.turnStartedAt ?? item.timestamp}
                          />
                        </>
                      );
                    })()
                  ) : item.text.length > 0 ? (
                    <MessageResponse className="chat-selectable">{item.text}</MessageResponse>
                  ) : null}
                </MessageContent>
              </Message>
            ))
          )}
        </div>
      </ScrollArea>
      {!isAtBottom ? (
        <Button
          className={cn(
            "absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full dark:bg-background dark:hover:bg-muted",
            scrollButtonClassName,
          )}
          onClick={() => {
            void scrollToBottom();
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <ArrowDownIcon className="size-4" />
          <span className="sr-only">Scroll to bottom</span>
        </Button>
      ) : null}
    </div>
  );
};
