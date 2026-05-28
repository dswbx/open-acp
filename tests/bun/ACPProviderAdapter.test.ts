import { describe, expect, it } from "vitest";
import { ACPProviderAdapter } from "../../src/bun/providers/ACPProviderAdapter.ts";
import type { ProviderEvent } from "../../src/bun/providers/providerContract.ts";

function createAdapter(): ACPProviderAdapter {
  return new ACPProviderAdapter({
    provider: "qwen",
    command: "qwen",
    args: [],
    cwd: "/workspace/project",
  });
}

describe("ACPProviderAdapter", () => {
  it("preserves Qwen shell-command content when raw output is empty", () => {
    const adapter = createAdapter();
    const events: ProviderEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    (
      adapter as unknown as {
        handleSessionUpdate: (sessionId: string, update: Record<string, unknown>) => void;
      }
    ).handleSessionUpdate("session-1", {
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-rm",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: "Command: rm /workspace/project/scripts/benchmark-baseline.ts\nExit Code: 0",
          },
        },
      ],
      _meta: {
        toolName: "run_shell_command",
      },
      rawOutput: "",
    });

    expect(events).toEqual([
      {
        type: "tool_call_update",
        sessionId: "session-1",
        tool: {
          toolCallId: "tool-rm",
          kind: "run_shell_command",
          status: "completed",
          output: [
            {
              type: "content",
              content: {
                type: "text",
                text: "Command: rm /workspace/project/scripts/benchmark-baseline.ts\nExit Code: 0",
              },
            },
          ],
          errorText: undefined,
        },
      },
    ]);
  });

  it("summarizes Qwen plan entries as task updates", () => {
    const adapter = createAdapter();
    const events: ProviderEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    (
      adapter as unknown as {
        handleSessionUpdate: (sessionId: string, update: Record<string, unknown>) => void;
      }
    ).handleSessionUpdate("session-1", {
      sessionUpdate: "plan",
      entries: [
        {
          content: "Create src/lib/utils.ts",
          status: "pending",
        },
        {
          content: "Update README.md",
          status: "in_progress",
        },
      ],
    });

    expect(events).toEqual([
      {
        type: "reasoning",
        sessionId: "session-1",
        updateType: "plan",
        summary: "Updated tasks",
        detail: "pending: Create src/lib/utils.ts\nin progress: Update README.md",
      },
    ]);
  });

  it("emits ACP session info updates as metadata events", () => {
    const adapter = createAdapter();
    const events: ProviderEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    (
      adapter as unknown as {
        handleSessionUpdate: (sessionId: string, update: Record<string, unknown>) => void;
      }
    ).handleSessionUpdate("session-1", {
      sessionUpdate: "session_info_update",
      title: "Yo Chat",
    });

    expect(events).toEqual([
      {
        type: "session_info",
        sessionId: "session-1",
        title: "Yo Chat",
        updatedAt: undefined,
      },
      {
        type: "reasoning",
        sessionId: "session-1",
        updateType: "session_info_update",
        summary: "Updated session title",
        detail: JSON.stringify(
          {
            sessionUpdate: "session_info_update",
            title: "Yo Chat",
          },
          null,
          2,
        ),
      },
    ]);
  });
});
