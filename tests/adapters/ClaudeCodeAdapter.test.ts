import { describe, expect, it } from "vitest";
import type { SessionUpdateListener } from "../../src/core/acp/ACPClient.ts";
import { ClaudeCodeAdapter } from "../../src/core/adapters/ClaudeCodeAdapter.ts";

class FakeACPClient {
  private readonly initializeResult = {
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: true,
      sessionCapabilities: {
        list: {},
        resume: {}
      }
    },
    authMethods: [{ type: "terminal" }, { type: "agent" }],
    _meta: {
      models: [
        {
          id: "claude-sonnet-4.6",
          title: "Claude Sonnet 4.6",
          contextWindowTokens: 200000
        }
      ]
    }
  };

  private sessionUpdateListener?: SessionUpdateListener;

  async initialize() {
    return this.initializeResult;
  }

  async createSession() {
    return { sessionId: "claude-session-1" };
  }

  async listSessions() {
    return {
      sessions: [
        {
          sessionId: "claude-session-1",
          cwd: "/workspace",
          title: "Fix tests"
        }
      ]
    };
  }

  async prompt() {
    return {};
  }

  async cancel() {}

  onSessionUpdate(listener: SessionUpdateListener) {
    this.sessionUpdateListener = listener;
  }

  offSessionUpdate(listener: SessionUpdateListener) {
    if (this.sessionUpdateListener === listener) {
      this.sessionUpdateListener = undefined;
    }
  }

  emitSessionUpdate() {
    if (!this.sessionUpdateListener) {
      return;
    }
    this.sessionUpdateListener({
      sessionId: "claude-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "Done"
        }
      }
    });
  }
}

describe("ClaudeCodeAdapter", () => {
  it("maps ACP initialize response into normalized capabilities", async () => {
    const fakeClient = new FakeACPClient();
    const adapter = new ClaudeCodeAdapter(fakeClient);

    const capabilities = await adapter.initialize();

    expect(capabilities.loadSession).toBe(true);
    expect(capabilities.session.list).toBe(true);
    expect(capabilities.session.resume).toBe(true);
    expect(capabilities.session.stop).toBe(false);
    expect(capabilities.supportsTerminalAuth).toBe(true);
    expect(capabilities.models[0]).toMatchObject({
      id: "claude-sonnet-4.6",
      contextWindowTokens: 200000
    });
  });

  it("forwards ACP session updates through adapter listener", () => {
    const fakeClient = new FakeACPClient();
    const adapter = new ClaudeCodeAdapter(fakeClient);
    const events: string[] = [];

    adapter.setSessionUpdateListener((event) => {
      events.push(`${event.sessionId}:${event.update.sessionUpdate}`);
    });
    fakeClient.emitSessionUpdate();

    expect(events).toEqual(["claude-session-1:agent_message_chunk"]);
  });

  it("replaces prior session update listener on repeated registration", () => {
    const fakeClient = new FakeACPClient();
    const adapter = new ClaudeCodeAdapter(fakeClient);
    const events: string[] = [];

    adapter.setSessionUpdateListener(() => {
      events.push("old");
    });
    adapter.setSessionUpdateListener(() => {
      events.push("new");
    });
    fakeClient.emitSessionUpdate();

    expect(events).toEqual(["new"]);
  });
});
