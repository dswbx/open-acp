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
  ConversationScrollButton
} from "../../components/ai-elements/conversation.tsx";
import {
  Message,
  MessageContent,
  MessageResponse
} from "../../components/ai-elements/message.tsx";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../components/ai-elements/tool.tsx";
import { Spinner } from "../../components/ui/spinner.tsx";
import { mapChatMessagesToSurface } from "../chat/chatSurfaceModel.ts";
import type { ChatMessage } from "../chat/types.ts";

interface ChatSurfaceProps {
  messages: readonly ChatMessage[];
}

export const ChatSurface = ({ messages }: ChatSurfaceProps): React.ReactNode => {
  const items = mapChatMessagesToSurface(messages);

  return (
    <Conversation className="mb-3 min-h-0 flex-1 rounded-md border border-border bg-muted/40">
      <ConversationContent className="gap-4 p-3">
        {items.length === 0 ? (
          <ConversationEmptyState
            description="Send a message to begin."
            title="No chat messages yet"
          />
        ) : (
          items.map((item) => (
            <Message from={item.from} key={item.id}>
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
              <MessageContent
                className={item.isError ? "text-destructive" : undefined}
              >
                {item.reasoningSteps.length > 0 ? (
                  <ChainOfThought className="mb-2" defaultOpen={item.isStreaming}>
                    <ChainOfThoughtHeader>
                      {item.isStreaming ? "Thinking" : "Thought process"}
                    </ChainOfThoughtHeader>
                    <ChainOfThoughtContent>
                      {item.reasoningSteps.map((step) => (
                        <ChainOfThoughtStep
                          description={step.description}
                          key={step.id}
                          label={step.label}
                          status={step.status}
                        />
                      ))}
                    </ChainOfThoughtContent>
                  </ChainOfThought>
                ) : null}
                {item.tools.map((tool) => (
                  <Tool
                    className="mb-2"
                    defaultOpen={false}
                    key={tool.toolCallId}
                  >
                    <ToolHeader
                      state={tool.state}
                      title={tool.title}
                      toolName={tool.title}
                      type="dynamic-tool"
                    />
                    {tool.input !== undefined || tool.output !== undefined || tool.errorText ? (
                      <ToolContent>
                        {tool.input !== undefined ? <ToolInput input={tool.input} /> : null}
                        {tool.output !== undefined || tool.errorText ? (
                          <ToolOutput
                            errorText={tool.errorText}
                            output={tool.output}
                          />
                        ) : null}
                      </ToolContent>
                    ) : null}
                  </Tool>
                ))}
                {item.text.length > 0 ? <MessageResponse>{item.text}</MessageResponse> : null}
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
