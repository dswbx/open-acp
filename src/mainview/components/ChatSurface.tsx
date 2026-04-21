import React from "react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "../../components/ai-elements/chain-of-thought.tsx";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation.tsx";
import { Message, MessageContent, MessageResponse } from "../../components/ai-elements/message.tsx";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../components/ai-elements/reasoning.tsx";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../components/ai-elements/tool.tsx";
import { Shimmer } from "../../components/ai-elements/shimmer.tsx";
import { Spinner } from "../../components/ui/spinner.tsx";
import { mapChatMessagesToSurface, type ChatSurfaceBlock } from "../chat/chatSurfaceModel.ts";
import type { ChatMessage } from "../chat/types.ts";

interface ChatSurfaceProps {
  messages: readonly ChatMessage[];
}

function renderBlock(block: ChatSurfaceBlock): React.ReactNode {
  switch (block.kind) {
    case "reasoning":
      return (
        <Reasoning className="mb-2" isStreaming={block.isActive} key={block.id}>
          <ReasoningTrigger
            getThinkingMessage={(isStreaming, duration) =>
              isStreaming ? (
                <Shimmer as="span" className="text-sm" duration={1.2}>
                  Thinking
                </Shimmer>
              ) : duration === undefined ? (
                <span>Thought for a few seconds</span>
              ) : (
                <span>Thought for {duration}s</span>
              )
            }
          />
          <ReasoningContent>{block.text}</ReasoningContent>
        </Reasoning>
      );
    case "text":
      return (
        <MessageResponse className="chat-selectable" key={block.id}>
          {block.text}
        </MessageResponse>
      );
    case "tool": {
      const tool = block.tool;
      return (
        <Tool className="mb-2" defaultOpen={false} key={block.id}>
          <ToolHeader
            subtitle={tool.subtitle}
            state={tool.state}
            title={tool.title}
            toolName={tool.title}
            type="dynamic-tool"
          />
          {tool.input !== undefined || tool.output !== undefined || tool.errorText ? (
            <ToolContent>
              {tool.input !== undefined ? <ToolInput input={tool.input} /> : null}
              {tool.output !== undefined || tool.errorText ? (
                <ToolOutput errorText={tool.errorText} output={tool.output} />
              ) : null}
            </ToolContent>
          ) : null}
        </Tool>
      );
    }
    case "reasoning-steps":
      return (
        <ChainOfThought className="mb-2" defaultOpen={false} key={block.id}>
          <ChainOfThoughtHeader>
            {block.isActive ? (
              <Shimmer as="span" className="text-sm" duration={1.2}>
                Thinking
              </Shimmer>
            ) : (
              "Thought process"
            )}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {block.steps.map((step) => (
              <ChainOfThoughtStep
                description={
                  block.isActive && step.status === "active" && step.description ? (
                    <Shimmer as="span" className="text-xs" duration={1.2}>
                      {step.description}
                    </Shimmer>
                  ) : (
                    step.description
                  )
                }
                key={step.id}
                label={
                  block.isActive && step.status === "active" ? (
                    <Shimmer as="span" className="text-sm" duration={1.2}>
                      {step.label}
                    </Shimmer>
                  ) : (
                    step.label
                  )
                }
                status={step.status}
              />
            ))}
          </ChainOfThoughtContent>
        </ChainOfThought>
      );
  }
}

export const ChatSurface = ({ messages }: ChatSurfaceProps): React.ReactNode => {
  const items = mapChatMessagesToSurface(messages);

  return (
    <Conversation className="chat-selectable mb-3 min-h-0 flex-1 rounded-md border border-border bg-muted/40">
      <ConversationContent className="chat-selectable gap-4 p-3">
        {items.length === 0 ? (
          <ConversationEmptyState
            description="Send a message to begin."
            title="No chat messages yet"
          />
        ) : (
          items.map((item) => (
            <Message className="chat-selectable" from={item.from} key={item.id}>
              {item.from === "assistant" ? (
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
              ) : null}
              <MessageContent
                className={item.isError ? "chat-selectable text-destructive" : "chat-selectable"}
              >
                {item.from === "assistant" ? (
                  <>
                    {item.blocks.map((block) => renderBlock(block))}
                    {item.text.length > 0 ? (
                      <MessageResponse className="chat-selectable">{item.text}</MessageResponse>
                    ) : null}
                  </>
                ) : item.text.length > 0 ? (
                  <MessageResponse className="chat-selectable">{item.text}</MessageResponse>
                ) : null}
                {item.showFallbackThinking ? (
                  <div className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="size-3" />
                    Thinking
                  </div>
                ) : null}
              </MessageContent>
            </Message>
          ))
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
};
