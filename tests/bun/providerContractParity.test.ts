import { describe, expect, it } from "vitest";
import { ACPProviderAdapter } from "../../src/bun/providers/ACPProviderAdapter.ts";
import { CodexProviderAdapter } from "../../src/bun/providers/CodexProviderAdapter.ts";
import type { ProviderAdapter, ProviderEvent } from "../../src/bun/providers/providerContract.ts";
import type { SmokeProvider } from "../../src/shared/providerModels.ts";
import { formatToolPresentation } from "../../src/mainview/chat/toolPresentation.ts";

type ProviderDialect = "codex-native" | "standard-acp" | "qwen-acp" | "opencode-acp";

interface ProviderFixture {
  dialect: ProviderDialect;
  adapter: ProviderAdapter;
  textUpdate: Record<string, unknown>;
  thoughtUpdate: Record<string, unknown>;
  toolStartUpdate: Record<string, unknown>;
  toolCompleteUpdate: Record<string, unknown>;
  fileEditInput: unknown;
  fileEditOutput: unknown;
  usageUpdate: Record<string, unknown>;
  planUpdate: Record<string, unknown>;
}

function createAcpAdapter(provider: SmokeProvider): ACPProviderAdapter {
  return new ACPProviderAdapter({
    provider,
    command: provider,
    args: [],
    cwd: "/workspace/project",
  });
}

function createCodexAdapter(): CodexProviderAdapter {
  const client = {
    connect: async () => undefined,
    disconnect: async () => undefined,
    initialize: async () => ({
      agentCapabilities: {},
      authMethods: [],
      _meta: {},
    }),
    createSession: async () => ({
      sessionId: "session-1",
      configOptions: [],
    }),
    loadSession: async () => ({
      sessionId: "session-1",
      configOptions: [],
    }),
    prompt: async () => ({ stopReason: "end_turn" }),
    cancel: async () => undefined,
    setConfigOption: async () => ({ configOptions: [] }),
    setMode: async () => ({ modes: { currentModeId: "build", availableModes: [] } }),
    onSessionUpdate: () => undefined,
    setPermissionRequestHandler: () => undefined,
    setUserInputRequestHandler: () => undefined,
  };
  return new CodexProviderAdapter("codex", client as never);
}

function emitUpdate(adapter: ProviderAdapter, update: Record<string, unknown>): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  const unsubscribe = adapter.subscribe((event) => events.push(event));
  (
    adapter as unknown as {
      handleSessionUpdate: (sessionId: string, update: Record<string, unknown>) => void;
    }
  ).handleSessionUpdate("session-1", update);
  unsubscribe();
  return events;
}

const indexPatch = [
  "Index: /workspace/project/src/lib/index.ts",
  "===================================================================",
  "--- /workspace/project/src/lib/index.ts",
  "+++ /workspace/project/src/lib/index.ts",
  "@@ -1 +1 @@",
  "-old",
  "+new",
].join("\n");

const fixtures: ProviderFixture[] = [
  {
    dialect: "codex-native",
    adapter: createCodexAdapter(),
    textUpdate: {
      sessionUpdate: "agent_message_chunk",
      content: [{ text: "Hello" }],
    },
    thoughtUpdate: {
      sessionUpdate: "agent_thought_chunk",
      content: [{ text: "Thinking" }],
    },
    toolStartUpdate: {
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      kind: "execute",
      title: "bash",
      status: "pending",
      rawInput: { command: "git status" },
    },
    toolCompleteUpdate: {
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-1",
      kind: "execute",
      title: "bash",
      status: "completed",
      rawOutput: { output: "ok" },
    },
    fileEditInput: [
      {
        path: "/workspace/project/src/lib/index.ts",
        kind: { type: "update" },
        diff: "@@ -1 +1 @@\n-old\n+new\n",
      },
    ],
    fileEditOutput: {
      type: "fileChange",
      changes: [
        {
          path: "/workspace/project/src/lib/index.ts",
          kind: { type: "update" },
          diff: "@@ -1 +1 @@\n-old\n+new\n",
        },
      ],
      status: "completed",
    },
    usageUpdate: {
      sessionUpdate: "usage_update",
      used: 12,
      size: 100,
      modelId: "codex-model",
    },
    planUpdate: {
      sessionUpdate: "plan_update",
      content: [{ text: "Inspect files" }],
    },
  },
  {
    dialect: "standard-acp",
    adapter: createAcpAdapter("claude"),
    textUpdate: {
      sessionUpdate: "agent_message_chunk",
      content: [{ text: "Hello" }],
    },
    thoughtUpdate: {
      sessionUpdate: "agent_thought_chunk",
      content: [{ text: "Thinking" }],
    },
    toolStartUpdate: {
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      kind: "execute",
      title: "bash",
      status: "pending",
      rawInput: { command: "git status" },
    },
    toolCompleteUpdate: {
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-1",
      kind: "execute",
      title: "bash",
      status: "completed",
      rawOutput: { output: "ok" },
    },
    fileEditInput: [
      {
        path: "/workspace/project/src/lib/index.ts",
        kind: { type: "update" },
        diff: "@@ -1 +1 @@\n-old\n+new\n",
      },
    ],
    fileEditOutput: {
      changes: [
        {
          path: "/workspace/project/src/lib/index.ts",
          kind: { type: "update" },
          diff: "@@ -1 +1 @@\n-old\n+new\n",
        },
      ],
    },
    usageUpdate: {
      sessionUpdate: "usage_update",
      used: 12,
      size: 100,
      modelId: "claude-model",
    },
    planUpdate: {
      sessionUpdate: "plan_update",
      content: [{ text: "Inspect files" }],
    },
  },
  {
    dialect: "qwen-acp",
    adapter: createAcpAdapter("qwen"),
    textUpdate: {
      sessionUpdate: "agent_message_chunk",
      content: [{ text: "Hello" }],
    },
    thoughtUpdate: {
      sessionUpdate: "agent_thought_chunk",
      content: [{ text: "Thinking" }],
    },
    toolStartUpdate: {
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      kind: "execute",
      title: "bash",
      status: "pending",
      rawInput: { command: "git status" },
    },
    toolCompleteUpdate: {
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-1",
      kind: "execute",
      title: "bash",
      status: "completed",
      rawOutput: { output: "ok" },
    },
    fileEditInput: {
      file_path: "/workspace/project/src/lib/index.ts",
      old_string: "old",
      new_string: "new",
    },
    fileEditOutput: {
      fileName: "index.ts",
      originalContent: "old\n",
      newContent: "new\n",
      fileDiff: indexPatch,
    },
    usageUpdate: {
      sessionUpdate: "usage_update",
      used: 12,
      size: 100,
      modelId: "qwen-model",
    },
    planUpdate: {
      sessionUpdate: "plan_update",
      content: [{ text: "Inspect files" }],
    },
  },
  {
    dialect: "opencode-acp",
    adapter: createAcpAdapter("opencode"),
    textUpdate: {
      sessionUpdate: "agent_message_chunk",
      content: [{ text: "Hello" }],
    },
    thoughtUpdate: {
      sessionUpdate: "agent_thought_chunk",
      content: [{ text: "Thinking" }],
    },
    toolStartUpdate: {
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      kind: "execute",
      title: "bash",
      status: "pending",
      rawInput: { command: "git status" },
    },
    toolCompleteUpdate: {
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-1",
      kind: "execute",
      title: "bash",
      status: "completed",
      rawOutput: { output: "ok" },
    },
    fileEditInput: {
      filePath: "/workspace/project/src/lib/index.ts",
      oldString: "old",
      newString: "new",
    },
    fileEditOutput: {
      output: "Edit applied successfully.",
      metadata: {
        filediff: {
          file: "/workspace/project/src/lib/index.ts",
          patch: indexPatch,
          additions: 1,
          deletions: 1,
        },
        truncated: false,
      },
    },
    usageUpdate: {
      sessionUpdate: "usage_update",
      used: 12,
      size: 100,
      modelId: "opencode-model",
    },
    planUpdate: {
      sessionUpdate: "plan_update",
      content: [{ text: "Inspect files" }],
    },
  },
];

describe("provider contract parity", () => {
  it.each(fixtures)("$dialect normalizes message chunks", ({ adapter, textUpdate }) => {
    expect(emitUpdate(adapter, textUpdate)).toEqual([
      {
        type: "message_chunk",
        sessionId: "session-1",
        text: "Hello",
      },
    ]);
  });

  it.each(fixtures)("$dialect normalizes thought chunks", ({ adapter, thoughtUpdate }) => {
    expect(emitUpdate(adapter, thoughtUpdate)).toEqual([
      {
        type: "thought_chunk",
        sessionId: "session-1",
        text: "Thinking",
      },
    ]);
  });

  it.each(fixtures)("$dialect normalizes tool start events", ({ adapter, toolStartUpdate }) => {
    expect(emitUpdate(adapter, toolStartUpdate)).toEqual([
      {
        type: "tool_call",
        sessionId: "session-1",
        tool: {
          toolCallId: "tool-1",
          kind: "execute",
          title: "bash",
          status: "pending",
          input: { command: "git status" },
        },
      },
    ]);
  });

  it.each(fixtures)(
    "$dialect normalizes tool completion events",
    ({ adapter, toolCompleteUpdate }) => {
      expect(emitUpdate(adapter, toolCompleteUpdate)).toEqual([
        {
          type: "tool_call_update",
          sessionId: "session-1",
          tool: {
            toolCallId: "tool-1",
            kind: "execute",
            title: "bash",
            status: "completed",
            output: { output: "ok" },
            errorText: undefined,
          },
        },
      ]);
    },
  );

  it.each(fixtures)(
    "$dialect presents file edit diffs consistently",
    ({ fileEditInput, fileEditOutput }) => {
      expect(
        formatToolPresentation({
          toolCallId: "tool-edit",
          toolKind: "edit",
          state: "output-available",
          input: fileEditInput,
          output: fileEditOutput,
        }),
      ).toMatchObject({
        title: "Edited index.ts +1 -1",
        fileChange: {
          verb: "Edited",
          target: "index.ts",
          additions: 1,
          deletions: 1,
          diffText: expect.stringContaining("diff --git a/index.ts b/index.ts"),
        },
      });
    },
  );

  it.each(fixtures)("$dialect normalizes usage updates", ({ adapter, usageUpdate }) => {
    expect(emitUpdate(adapter, usageUpdate)).toEqual([
      {
        type: "usage",
        sessionId: "session-1",
        usage: {
          used: 12,
          size: 100,
          modelId: expect.any(String),
        },
      },
    ]);
  });

  it.each(fixtures)("$dialect normalizes plan updates", ({ adapter, planUpdate }) => {
    expect(emitUpdate(adapter, planUpdate)).toEqual([
      {
        type: "plan_update",
        sessionId: "session-1",
        plan: {
          format: "text_delta",
          textDelta: "Inspect files",
        },
      },
    ]);
  });
});
