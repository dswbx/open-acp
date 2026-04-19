import { describe, expect, it } from "vitest";
import type { SessionUpdateListener } from "../../src/core/acp/ACPClient.ts";
import type { ACPInitializeResult } from "../../src/core/acp/ACPTypes.ts";
import { CodexAdapter } from "../../src/core/adapters/CodexAdapter.ts";

class FakeACPClient {
  private readonly initializeResult: ACPInitializeResult;
  private sessionUpdateListener?: SessionUpdateListener;

  constructor(initializeResult: ACPInitializeResult) {
    this.initializeResult = initializeResult;
  }

  async initialize() {
    return this.initializeResult;
  }

  async createSession() {
    return { sessionId: "codex-session-1" };
  }

  async listSessions() {
    return {
      sessions: [
        {
          sessionId: "codex-session-1",
          cwd: "/workspace",
          title: "Investigate regression",
        },
      ],
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
    this.sessionUpdateListener?.({
      sessionId: "codex-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "working",
        },
      },
    });
  }
}

describe("CodexAdapter", () => {
  it("initialize() maps ACP capability response into normalized capabilities", async () => {
    const fakeClient = new FakeACPClient({
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: {
          list: {},
          fork: {},
        },
      },
      authMethods: [{ type: "terminal" }, { type: "oauth" }],
      _meta: {
        models: [
          {
            id: "codex-mini",
            title: "Codex Mini",
            contextWindowTokens: 128000,
          },
        ],
      },
    });
    const adapter = new CodexAdapter(fakeClient);

    const capabilities = await adapter.initialize();

    expect(capabilities).toEqual({
      loadSession: true,
      authMethods: ["terminal", "oauth"],
      supportsTerminalAuth: true,
      session: {
        list: true,
        fork: true,
        resume: false,
        setModel: false,
        stop: false,
      },
      models: [
        {
          id: "codex-mini",
          title: "Codex Mini",
          contextWindowTokens: 128000,
        },
      ],
    });
  });

  it("forwards session updates through adapter listener", () => {
    const fakeClient = new FakeACPClient({
      protocolVersion: 1,
      agentCapabilities: {},
      authMethods: [],
    });
    const adapter = new CodexAdapter(fakeClient);
    const events: string[] = [];

    adapter.setSessionUpdateListener((event) => {
      events.push(`${event.sessionId}:${event.update.sessionUpdate}`);
    });
    fakeClient.emitSessionUpdate();

    expect(events).toEqual(["codex-session-1:agent_message_chunk"]);
  });

  it("normalizes optional model metadata", async () => {
    const fakeClient = new FakeACPClient({
      protocolVersion: 1,
      agentCapabilities: {},
      authMethods: [{ type: "oauth" }],
      _meta: {
        models: [
          {
            id: "codex",
            title: "Codex",
          },
          {
            title: "No ID",
            contextWindowTokens: "huge",
          },
          "skip-me",
        ],
      },
    });
    const adapter = new CodexAdapter(fakeClient);

    const capabilities = await adapter.initialize();

    expect(capabilities.models).toEqual([
      {
        id: "codex",
        title: "Codex",
        contextWindowTokens: null,
      },
      {
        id: "unknown-model-1",
        title: "No ID",
        contextWindowTokens: null,
      },
    ]);
  });
});
