import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "../../src/core/adapters/AdapterRegistry.ts";
import { AgentAdapter } from "../../src/core/adapters/AgentAdapter.ts";

class FakeAdapter extends AgentAdapter {
  readonly agentId: string;

  constructor(agentId: string) {
    super();
    this.agentId = agentId;
  }

  async initialize() {
    return {
      loadSession: true,
      authMethods: ["terminal"],
      supportsTerminalAuth: true,
      session: {
        list: true,
        fork: false,
        resume: false,
        setModel: false,
        stop: false,
      },
      models: [],
    };
  }

  async createSession() {
    return { sessionId: "s1" };
  }

  async listSessions() {
    return [];
  }

  async sendPrompt() {}

  async cancelPrompt() {}

  setSessionUpdateListener() {}
}

describe("AdapterRegistry", () => {
  it("registers and retrieves adapters", () => {
    const registry = new AdapterRegistry();
    const adapter = new FakeAdapter("claude-code");
    registry.register(adapter);

    expect(registry.get("claude-code")).toBe(adapter);
    expect(registry.list()).toHaveLength(1);
  });

  it("throws when registering duplicates", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter("claude-code"));

    expect(() => {
      registry.register(new FakeAdapter("claude-code"));
    }).toThrowError("Adapter already registered: claude-code");
  });
});
