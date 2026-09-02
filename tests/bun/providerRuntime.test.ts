import { describe, expect, it } from "vitest";
import {
  createSmokeRunnerOptions,
  getProviderRuntimeKey,
  resolveToolEventRequestId,
} from "../../src/bun/providerRuntime.ts";

describe("resolveToolEventRequestId", () => {
  it("uses the stored request for known tool updates", () => {
    expect(
      resolveToolEventRequestId(
        {
          activeRequestId: "request-active",
          toolCallRequestIds: new Map([["tool-1", "request-old"]]),
        },
        "tool-1",
      ),
    ).toBe("request-old");
  });

  it("falls back to the active request for synthetic tool updates", () => {
    expect(
      resolveToolEventRequestId(
        {
          activeRequestId: "request-active",
          toolCallRequestIds: new Map(),
        },
        "turn-diff:turn-1",
      ),
    ).toBe("request-active");
  });

  it("keeps routing known tool updates after a turn is cancelled", () => {
    expect(
      resolveToolEventRequestId(
        {
          activeRequestId: undefined,
          toolCallRequestIds: new Map([["tool-1", "request-cancelled"]]),
        },
        "tool-1",
      ),
    ).toBe("request-cancelled");
  });
});

describe("getProviderRuntimeKey", () => {
  it("isolates runtimes by workspace and provider", () => {
    expect(getProviderRuntimeKey("codex", "bknd")).toBe("bknd:codex");
    expect(getProviderRuntimeKey("codex", "web")).toBe("web:codex");
    expect(getProviderRuntimeKey("claude", "bknd")).toBe("bknd:claude");
    expect(getProviderRuntimeKey("codex")).toBe("default:codex");
  });
});

describe("createSmokeRunnerOptions", () => {
  it("launches Cursor through its ACP server", () => {
    expect(createSmokeRunnerOptions("cursor", "hello", "/workspace")).toMatchObject({
      cmd: "agent",
      args: ["acp"],
      cwd: "/workspace",
      prompt: "hello",
      transportKind: "acp",
    });
  });
});
