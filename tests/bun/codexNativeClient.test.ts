import { describe, expect, it } from "vitest";
import {
  CodexNativeClient,
  buildCodexNativeThreadLifecycleParams,
  normalizeCodexNativeUsageUpdate,
} from "../../src/bun/providers/codexNative/CodexNativeClient.ts";

describe("codex native client helpers", () => {
  it("starts threads in approval-gated read-only mode", () => {
    expect(buildCodexNativeThreadLifecycleParams("/repo")).toEqual({
      cwd: "/repo",
      persistExtendedHistory: true,
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandbox: "read-only",
    });
  });

  it("normalizes nested token usage payloads from codex app-server", () => {
    expect(
      normalizeCodexNativeUsageUpdate({
        tokenUsage: {
          total: {
            totalTokens: 95618,
            inputTokens: 95372,
            cachedInputTokens: 50688,
            outputTokens: 246,
            reasoningOutputTokens: 108,
          },
          last: {
            totalTokens: 47809,
            inputTokens: 47686,
            cachedInputTokens: 25344,
            outputTokens: 123,
            reasoningOutputTokens: 54,
          },
          modelContextWindow: 258400,
        },
      }),
    ).toEqual({
      used: 47809,
      size: 258400,
      usage: {
        inputTokens: 47686,
        outputTokens: 123,
        reasoningTokens: 54,
        cachedInputTokens: 25344,
      },
    });
  });

  it("uses last token usage for current context when cumulative total exceeds the window", () => {
    expect(
      normalizeCodexNativeUsageUpdate({
        tokenUsage: {
          total: {
            totalTokens: 270949,
            inputTokens: 269636,
            cachedInputTokens: 254720,
            outputTokens: 1313,
            reasoningOutputTokens: 894,
          },
          last: {
            totalTokens: 27975,
            inputTokens: 27841,
            cachedInputTokens: 27520,
            outputTokens: 134,
            reasoningOutputTokens: 102,
          },
          modelContextWindow: 258400,
        },
      }),
    ).toEqual({
      used: 27975,
      size: 258400,
      usage: {
        inputTokens: 27841,
        outputTokens: 134,
        reasoningTokens: 102,
        cachedInputTokens: 27520,
      },
    });
  });

  it("falls back to legacy flat usage fields when nested token usage is absent", () => {
    expect(
      normalizeCodexNativeUsageUpdate({
        totalTokens: 12,
        maxTokens: 100,
        inputTokens: 6,
        outputTokens: 4,
        reasoningTokens: 1,
        cachedInputTokens: 2,
      }),
    ).toEqual({
      used: 12,
      size: 100,
      usage: {
        inputTokens: 6,
        outputTokens: 4,
        reasoningTokens: 1,
        cachedInputTokens: 2,
      },
    });
  });

  it("emits Codex turn diffs as synthetic file-change updates", () => {
    const client = new CodexNativeClient({
      cwd: "/repo",
      workspaceRoot: "/repo",
    });
    const updates: unknown[] = [];
    client.onSessionUpdate((payload) => updates.push(payload));

    const unsafeClient = client as unknown as {
      activeTurn: {
        sessionId: string;
        threadId: string;
        turnId: string;
        resolve: () => void;
        reject: () => void;
      };
      handleNotification: (message: Record<string, unknown>) => void;
    };
    unsafeClient.activeTurn = {
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      resolve: () => undefined,
      reject: () => undefined,
    };

    unsafeClient.handleNotification({
      method: "turn/diff/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        diff: "diff --git a/test.txt b/test.txt\n--- /dev/null\n+++ b/test.txt\n@@ -0,0 +1 @@\n+hello\n",
      },
    });

    expect(updates).toEqual([
      {
        sessionId: "session-1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "turn-diff:turn-1",
          kind: "file_change",
          title: "File change",
          status: "completed",
          rawOutput: {
            type: "turnDiff",
            diff: "diff --git a/test.txt b/test.txt\n--- /dev/null\n+++ b/test.txt\n@@ -0,0 +1 @@\n+hello\n",
          },
        },
      },
    ]);
  });

  it("enriches file-change approval requests from the started item payload", async () => {
    const client = new CodexNativeClient({
      cwd: "/repo",
      workspaceRoot: "/repo",
    });
    const requests: unknown[] = [];
    client.setPermissionRequestHandler(async (request) => {
      requests.push(request);
      return { outcome: "selected", optionId: "accept" };
    });

    const unsafeClient = client as unknown as {
      currentSessionId: string;
      activeTurn: {
        sessionId: string;
        threadId: string;
        turnId: string;
        resolve: () => void;
        reject: () => void;
      };
      handleNotification: (message: Record<string, unknown>) => void;
      handleApprovalRequest: (
        message: Record<string, unknown>,
      ) => Promise<{ outcome: string; optionId?: string }>;
    };
    unsafeClient.currentSessionId = "session-1";
    unsafeClient.activeTurn = {
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      resolve: () => undefined,
      reject: () => undefined,
    };

    unsafeClient.handleNotification({
      method: "item/started",
      params: {
        item: {
          type: "fileChange",
          id: "file-change-1",
          changes: [
            {
              path: "/repo/test.txt",
              kind: { type: "add" },
              diff: "hello\n",
            },
          ],
          status: "inProgress",
        },
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });

    await unsafeClient.handleApprovalRequest({
      id: 7,
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "file-change-1",
        reason: null,
      },
    });

    expect(requests).toEqual([
      expect.objectContaining({
        requestId: 7,
        sessionId: "session-1",
        toolCall: expect.objectContaining({
          toolCallId: "file-change-1",
          kind: "file_change",
          title: "File change",
          rawInput: JSON.stringify(
            [
              {
                path: "/repo/test.txt",
                kind: { type: "add" },
                diff: "hello\n",
              },
            ],
            null,
            2,
          ),
          locations: [{ path: "/repo/test.txt" }],
        }),
      }),
    ]);
  });
});
