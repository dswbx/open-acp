import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompactReasoning } from "../../src/mainview/components/CompactReasoning.tsx";
import { ChatSurface } from "../../src/mainview/components/ChatSurface.tsx";
import { CompactToolCall } from "../../src/mainview/components/CompactToolCall.tsx";
import { formatToolPresentation } from "../../src/mainview/chat/toolPresentation.ts";
import type { ChatMessage } from "../../src/mainview/chat/types.ts";

const stickToBottomMock = vi.hoisted(() => {
  const scrollToBottom = vi.fn();
  return {
    scrollToBottom,
    useStickToBottom: vi.fn(() => ({
      contentRef: vi.fn(),
      isAtBottom: true,
      scrollRef: vi.fn(),
      scrollToBottom,
    })),
  };
});

vi.mock("use-stick-to-bottom", () => ({
  useStickToBottom: stickToBottomMock.useStickToBottom,
}));

const messages: ChatMessage[] = [
  {
    id: "u1",
    author: "user",
    provider: "codex",
    text: "hello",
    timestamp: "2026-04-17T00:00:00.000Z",
    status: "complete",
  },
  {
    id: "a1",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:01.000Z",
    status: "streaming",
  },
];

const completeMessages: ChatMessage[] = [
  {
    id: "u-complete",
    author: "user",
    provider: "codex",
    text: "hello",
    timestamp: "2026-04-17T00:00:00.000Z",
    status: "complete",
  },
];

const messagesWithReasoningSteps: ChatMessage[] = [
  {
    id: "a2",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:02.000Z",
    status: "streaming",
    blocks: [
      {
        kind: "reasoning-steps",
        id: "rs-1",
        steps: [
          {
            id: "r1",
            summary: "Planning response",
            detail: "Checking the current state before replying",
            updateType: "analysis",
            timestamp: "2026-04-17T00:00:02.000Z",
          },
        ],
      },
    ],
  },
];

const messagesWithReasoningAndTool: ChatMessage[] = [
  {
    id: "a4",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:04.000Z",
    status: "streaming",
    blocks: [
      {
        kind: "reasoning",
        id: "r1",
        text: "I'll inspect the renderer first.",
        startedAt: "2026-04-17T00:00:01.000Z",
        endedAt: "2026-04-17T00:00:03.000Z",
      },
      {
        kind: "tool",
        id: "b-tool-2",
        tool: {
          toolCallId: "tool-2",
          title: "Read ChatSurface.tsx",
          state: "output-available",
          timestamp: "2026-04-17T00:00:04.000Z",
        },
      },
    ],
  },
];

const streamingMessageWithFinishedReasoning: ChatMessage[] = [
  {
    id: "a5",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:05.000Z",
    status: "streaming",
    blocks: [
      {
        kind: "reasoning",
        id: "r1",
        text: "I inspected the renderer first.",
        startedAt: "2026-04-17T00:00:01.000Z",
        endedAt: "2026-04-17T00:00:03.000Z",
      },
      { kind: "text", id: "t1", text: "Done." },
    ],
  },
];

const completedMessageWithToolAndText: ChatMessage[] = [
  {
    id: "a7",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:06.000Z",
    turnStartedAt: "2026-04-17T00:00:00.000Z",
    turnEndedAt: "2026-04-17T00:00:06.000Z",
    status: "complete",
    blocks: [
      ...Array.from({ length: 6 }, (_, i) => ({
        kind: "tool" as const,
        id: `b-tool-collapse-${i}`,
        tool: {
          toolCallId: `tool-c-${i}`,
          title: "Edited App.tsx",
          state: "output-available" as const,
          timestamp: "2026-04-17T00:00:05.000Z",
        },
      })),
      { kind: "text" as const, id: "t1", text: "Done." },
    ],
  },
];

const completedMessageWithTextBlockAndText: ChatMessage[] = [
  {
    id: "a6",
    author: "assistant",
    provider: "qwen",
    text: 'Updated the title to "jsonv-ts: Because JSON Deserves Better Than `any`"',
    timestamp: "2026-04-25T18:19:30.184Z",
    status: "complete",
    blocks: [
      {
        kind: "text",
        id: "t1",
        text: 'Updated the title to "jsonv-ts: Because JSON Deserves Better Than `any`"',
      },
    ],
  },
];

const messagesWithTool: ChatMessage[] = [
  {
    id: "a3",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:03.000Z",
    status: "streaming",
    blocks: [
      {
        kind: "tool",
        id: "b-tool-1",
        tool: {
          toolCallId: "tool-1",
          title: "Edited App.tsx",
          kind: "functions.apply_patch",
          state: "output-available",
          input: {
            patch: "*** Begin Patch\n*** Update File: src/mainview/App.tsx\n*** End Patch",
          },
          timestamp: "2026-04-17T00:00:03.000Z",
        },
      },
    ],
  },
];

describe("ChatSurface", () => {
  beforeEach(() => {
    stickToBottomMock.scrollToBottom.mockClear();
    stickToBottomMock.useStickToBottom.mockClear();
  });

  it("renders message text and a thinking indicator below streaming content", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messages} />);
    expect(html).toContain("hello");
    expect(html).toContain('aria-label="Loading"');
    expect(html).not.toContain("Streaming...");
  });

  it("does not force scroll to bottom on initial mount", () => {
    const useEffectSpy = vi.spyOn(React, "useEffect").mockImplementation((effect) => {
      effect();
    });

    try {
      renderToStaticMarkup(
        <ChatSurface forceScrollToBottomToken={0} messages={completeMessages} />,
      );
    } finally {
      useEffectSpy.mockRestore();
    }

    expect(stickToBottomMock.scrollToBottom).not.toHaveBeenCalled();
  });

  it("forces scroll to bottom when the outbound submit token changes after mount", () => {
    const useEffectSpy = vi.spyOn(React, "useEffect").mockImplementation((effect) => {
      effect();
    });
    const originalUseRef = React.useRef;
    let useRefCallCount = 0;
    const useRefSpy = vi.spyOn(React, "useRef").mockImplementation((initialValue) => {
      useRefCallCount += 1;
      if (useRefCallCount === 1) {
        return { current: true } as React.MutableRefObject<typeof initialValue>;
      }
      return originalUseRef(initialValue);
    });

    try {
      renderToStaticMarkup(
        <ChatSurface forceScrollToBottomToken={1} messages={completeMessages} />,
      );
    } finally {
      useEffectSpy.mockRestore();
      useRefSpy.mockRestore();
    }

    expect(stickToBottomMock.scrollToBottom).toHaveBeenCalledWith({
      animation: "smooth",
      ignoreEscapes: true,
    });
  });

  it("renders reasoning updates as compact rows without thought-process chrome", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messagesWithReasoningSteps} />);

    expect(html).toContain("Planning response");
    expect(html).toContain("text-transparent");
    expect(html).not.toContain("Thought process");
    expect(html).not.toContain("Brain");
  });

  it("renders compact tool rows in the chat surface", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messagesWithTool} />);

    expect(html).toContain("Edited App.tsx");
    expect(html).toContain('data-chat-interactive-trigger="tool-call"');
    expect(html).not.toContain("Awaiting Approval");
    expect(html).not.toContain("Completed");
    expect(html).not.toContain("…/src/mainview/App.tsx");
  });

  it("marks compact tool triggers as pointer-cursor interactive controls", () => {
    const html = renderToStaticMarkup(
      <CompactToolCall
        tool={{
          toolCallId: "tool-1",
          title: "Ran git status --short",
          state: "output-available",
          input: {
            cmd: "git status --short",
          },
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain('data-chat-interactive-trigger="tool-call"');
    expect(html).toContain("cursor-pointer");
  });

  it("keeps chat text selectable without forcing text cursors on interactive triggers", () => {
    const css = readFileSync("src/mainview/styles.css", "utf8");

    expect(css).toContain(".chat-selectable *");
    expect(css).toContain("cursor: text");
    expect(css).toContain("[data-chat-interactive-trigger]");
    expect(css).toContain("[data-chat-interactive-trigger] *");
    expect(css).toContain("cursor: pointer");
  });

  it("renders reasoning before tool calls when reasoning precedes the tool block", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messagesWithReasoningAndTool} />);

    expect(html).toContain("Thought for 2s");
    expect(html.indexOf("Thought for 2s")).toBeLessThan(html.indexOf("Read ChatSurface.tsx"));
  });

  it("labels finished reasoning with elapsed thinking copy while still streaming", () => {
    const html = renderToStaticMarkup(
      <ChatSurface messages={streamingMessageWithFinishedReasoning} />,
    );

    expect(html).toContain("Thought for 2s");
    expect(html).not.toContain("Thought process");
  });

  it("collapses completed turn intermediate work into a Worked-for summary", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={completedMessageWithToolAndText} />);

    expect(html).toContain("Worked for 6s");
    expect(html).toContain("6 steps");
    expect(html).toContain("Done.");
    expect(html).not.toContain("Edited App.tsx");
  });

  it("does not render cached assistant text when text blocks already render it", () => {
    const html = renderToStaticMarkup(
      <ChatSurface messages={completedMessageWithTextBlockAndText} />,
    );

    expect(
      html.match(/Updated the title to &quot;jsonv-ts: Because JSON Deserves Better Than/g) ?? [],
    ).toHaveLength(1);
  });

  it("renders compact active reasoning rows with the thought text expandable", () => {
    const html = renderToStaticMarkup(
      <CompactReasoning
        defaultOpen
        isActive
        startedAt="2026-04-17T00:00:01.000Z"
        text="I am checking the files first."
      />,
    );

    expect(html).toContain("Thinking");
    expect(html).toContain("text-transparent");
    expect(html).toContain("I am checking the files first.");
    expect(html).not.toContain("Brain");
    expect(html).not.toContain("ChevronDown");
  });

  it("shimmers only the active tool verb", () => {
    const html = renderToStaticMarkup(
      <CompactToolCall
        tool={{
          toolCallId: "tool-1",
          title: "Reading package.json",
          shimmerPrefix: "Reading",
          state: "input-available",
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain("Reading");
    expect(html).toContain("package.json");
    expect(html).toContain("text-transparent");
    expect(html).not.toContain("Wrench");
    expect(html).not.toContain("leading-none");
    expect(html).not.toContain("text-xs");
    expect(html).not.toContain("ChevronDown");
  });

  it("preserves expandable tool payloads", () => {
    const html = renderToStaticMarkup(
      <CompactToolCall
        defaultOpen
        tool={{
          toolCallId: "tool-1",
          title: "Ran git status --short",
          state: "output-available",
          input: {
            cmd: "git status --short",
          },
          output: {
            stdout: "M src/mainview/App.tsx",
          },
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain("Ran git status --short");
    expect(html).toContain("Parameters");
    expect(html).toContain("git status --short");
    expect(html).toContain("M src/mainview/App.tsx");
  });

  it("renders file-change tool rows with colored filename and diff totals", () => {
    const presentation = formatToolPresentation({
      toolCallId: "tool-1",
      toolKind: "file_change",
      state: "output-available",
      output: {
        changes: [
          {
            path: "/workspace/project/App.tsx",
            kind: { type: "update" },
            diff: "@@ -1,2 +1,3 @@\n const value = 1;\n-old\n+new\n+next\n",
          },
        ],
      },
    });
    const html = renderToStaticMarkup(
      <CompactToolCall
        tool={{
          toolCallId: "tool-1",
          title: presentation.title,
          shimmerPrefix: presentation.shimmerPrefix,
          fileChange: presentation.fileChange,
          kind: "file_change",
          state: "output-available",
          output: {
            changes: [
              {
                path: "/workspace/project/App.tsx",
                kind: { type: "update" },
                diff: "@@ -1,2 +1,3 @@\n const value = 1;\n-old\n+new\n+next\n",
              },
            ],
          },
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain("Edited");
    expect(html).toContain("App.tsx");
    expect(html).toContain("text-tool-call-accent");
    expect(html).toContain("+2");
    expect(html).toContain("-1");
    expect(html).not.toContain("Parameters");
  });

  it("shimmers only active file-change verbs", () => {
    const presentation = formatToolPresentation({
      toolCallId: "tool-1",
      toolKind: "file_change",
      state: "input-available",
      input: JSON.stringify([
        {
          path: "/workspace/project/test.txt",
          kind: { type: "add" },
          diff: "hello world\n",
        },
      ]),
    });
    const html = renderToStaticMarkup(
      <CompactToolCall
        tool={{
          toolCallId: "tool-1",
          title: presentation.title,
          shimmerPrefix: presentation.shimmerPrefix,
          fileChange: presentation.fileChange,
          kind: "file_change",
          state: "input-available",
          input: JSON.stringify([
            {
              path: "/workspace/project/test.txt",
              kind: { type: "add" },
              diff: "hello world\n",
            },
          ]),
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain("Creating");
    expect(html).toContain("test.txt");
    expect(html).toContain("text-transparent");
    expect(html).not.toContain("text-green-500");
    expect(html).not.toContain("text-rose-500");
  });

  it("renders rich git diff content instead of raw payloads for expanded file changes", () => {
    const presentation = formatToolPresentation({
      toolCallId: "tool-1",
      toolKind: "file_change",
      state: "output-available",
      output: {
        changes: [
          {
            path: "/workspace/project/test.txt",
            kind: { type: "add" },
            diff: "hello world\n",
          },
        ],
      },
    });
    const html = renderToStaticMarkup(
      <CompactToolCall
        defaultOpen
        tool={{
          toolCallId: "tool-1",
          title: presentation.title,
          fileChange: presentation.fileChange,
          kind: "file_change",
          state: "output-available",
          output: {
            changes: [
              {
                path: "/workspace/project/test.txt",
                kind: { type: "add" },
                diff: "hello world\n",
              },
            ],
          },
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain('data-git-diff-file="test.txt"');
    expect(html).toContain('data-git-diff-view="unified"');
    expect(html).toContain("test.txt");
    expect(html).toContain("+1");
    expect(html).toContain("-0");
    expect(html).toContain("diff-code-insert");
    expect(html).toContain("diff-gutter-insert");
    expect(html).toContain("git-diff-auto-gutter");
    expect(html).toContain("--git-diff-gutter-digits:1");
    expect(html).not.toContain("git-diff-compact-gutter");
    expect(html).not.toContain("border-l");
    expect(html).toContain("hello world");
    expect(html).not.toContain("&quot;changes&quot;");
    expect(html).not.toContain("Parameters");
  });

  it("renders file headers for each file in expanded turn diffs", () => {
    const presentation = formatToolPresentation({
      toolCallId: "turn-diff:turn-1",
      toolKind: "file_change",
      state: "output-available",
      output: {
        type: "turnDiff",
        diff: [
          "diff --git a/src/old.ts b/src/old.ts",
          "deleted file mode 100644",
          "--- a/src/old.ts",
          "+++ /dev/null",
          "@@ -1 +0,0 @@",
          "-old",
          "diff --git a/src/new.ts b/src/new.ts",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/src/new.ts",
          "@@ -0,0 +1 @@",
          "+new",
        ].join("\n"),
      },
    });

    const html = renderToStaticMarkup(
      <CompactToolCall
        defaultOpen
        tool={{
          toolCallId: "turn-diff:turn-1",
          title: presentation.title,
          fileChange: presentation.fileChange,
          kind: "file_change",
          state: "output-available",
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain('data-git-diff-file="src/old.ts"');
    expect(html).toContain('data-git-diff-file="src/new.ts"');
    expect(html).toContain("src/old.ts");
    expect(html).toContain("src/new.ts");
    expect(html).toContain("Changed");
    expect(html).toContain("2 files");
    expect(html).toContain("+1");
    expect(html).toContain("-1");
  });

  it("renders Qwen fileDiff outputs as rich file-change diffs", () => {
    const presentation = formatToolPresentation({
      toolCallId: "tool-qwen-edit",
      toolKind: "edit",
      state: "output-available",
      input: {
        file_path: "/workspace/project/package.json",
        old_string: '"description": "old"',
        new_string: '"description": "new"',
      },
      output: {
        fileName: "package.json",
        originalContent: '"description": "old"\n',
        newContent: '"description": "new"\n',
        fileDiff: [
          "Index: package.json",
          "===================================================================",
          "--- package.json\tCurrent",
          "+++ package.json\tProposed",
          "@@ -1 +1 @@",
          '-"description": "old"',
          '+"description": "new"',
        ].join("\n"),
      },
    });

    const html = renderToStaticMarkup(
      <CompactToolCall
        defaultOpen
        tool={{
          toolCallId: "tool-qwen-edit",
          title: presentation.title,
          fileChange: presentation.fileChange,
          kind: "edit",
          state: "output-available",
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(html).toContain("Edited");
    expect(html).toContain("package.json");
    expect(html).toContain('data-git-diff-file="package.json"');
    expect(html).toContain("git-diff-auto-gutter");
    expect(html).toContain("&quot;description&quot;: &quot;");
    expect(html).toContain("old");
    expect(html).toContain("new");
    expect(html).not.toContain("fileDiff");
    expect(html).not.toContain("Parameters");
  });

  it("aligns created and deleted file-change line numbers in the same gutter", () => {
    const createdPresentation = formatToolPresentation({
      toolCallId: "tool-created",
      toolKind: "file_change",
      state: "output-available",
      output: {
        changes: [
          {
            path: "/workspace/project/test.txt",
            kind: { type: "add" },
            diff: "hello world\n",
          },
        ],
      },
    });
    const deletedPresentation = formatToolPresentation({
      toolCallId: "tool-deleted",
      toolKind: "file_change",
      state: "output-available",
      output: {
        changes: [
          {
            path: "/workspace/project/test.txt",
            kind: { type: "delete" },
            diff: "hello world\n",
          },
        ],
      },
    });

    const createdHtml = renderToStaticMarkup(
      <CompactToolCall
        defaultOpen
        tool={{
          toolCallId: "tool-created",
          title: createdPresentation.title,
          fileChange: createdPresentation.fileChange,
          kind: "file_change",
          state: "output-available",
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );
    const deletedHtml = renderToStaticMarkup(
      <CompactToolCall
        defaultOpen
        tool={{
          toolCallId: "tool-deleted",
          title: deletedPresentation.title,
          fileChange: deletedPresentation.fileChange,
          kind: "file_change",
          state: "output-available",
          timestamp: "2026-04-17T00:00:03.000Z",
        }}
      />,
    );

    expect(createdHtml).toContain("git-diff-auto-gutter");
    expect(deletedHtml).toContain("git-diff-auto-gutter");
    expect(createdHtml).toContain(
      'class="diff-gutter diff-gutter-insert" data-change-key="I1"></td><td class="diff-gutter diff-gutter-insert" data-change-key="I1">1</td>',
    );
    expect(deletedHtml).toContain(
      'class="diff-gutter diff-gutter-delete" data-change-key="D1"></td><td class="diff-gutter diff-gutter-delete" data-change-key="D1">1</td>',
    );
  });
});
