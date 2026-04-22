import { describe, expect, it } from "vitest";
import {
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
});
