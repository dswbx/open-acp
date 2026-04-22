import { describe, expect, it } from "vitest";
import { createSmokeRunnerOptions } from "../../src/bun/providerRuntime.ts";

describe("createSmokeRunnerOptions", () => {
  it("maps each SmokeProvider to the expected command and args", () => {
    expect(createSmokeRunnerOptions("codex", "hi", "/cwd")).toMatchObject({
      cwd: "/cwd",
      prompt: "hi",
      protocolVersion: 1,
      cmd: "codex",
      args: ["app-server"],
      transportKind: "codex-native",
    });
    expect(createSmokeRunnerOptions("claude", "hi", "/cwd")).toMatchObject({
      cmd: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp"],
      transportKind: "acp",
    });
    expect(createSmokeRunnerOptions("qwen", "hi", "/cwd")).toMatchObject({
      cmd: "npx",
      args: ["-y", "@qwen-code/qwen-code", "--acp"],
      transportKind: "acp",
    });
    expect(createSmokeRunnerOptions("opencode", "hi", "/cwd")).toMatchObject({
      cmd: "opencode",
      args: ["acp"],
      transportKind: "acp",
    });
  });

  it("propagates cwd and prompt verbatim", () => {
    const options = createSmokeRunnerOptions("codex", "say hello", "/tmp/workspace");
    expect(options.cwd).toBe("/tmp/workspace");
    expect(options.prompt).toBe("say hello");
  });
});
