import { describe, expect, it } from "vitest";
import type { SessionUpdateListener } from "../../src/core/acp/ACPClient.ts";
import type { ACPInitializeResult } from "../../src/core/acp/ACPTypes.ts";
import { OpenCodeAdapter } from "../../src/core/adapters/OpenCodeAdapter.ts";

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
    return { sessionId: "opencode-session-1" };
  }

  async listSessions() {
    return {
      sessions: [
        {
          sessionId: "opencode-session-1",
          cwd: "/workspace",
          title: "OpenCode task",
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
      sessionId: "opencode-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "OpenCode reply",
        },
      },
    });
  }
}

describe("OpenCodeAdapter", () => {
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
      authMethods: [{ type: "oauth" }, { type: "terminal" }],
      _meta: {
        models: [
          {
            id: "opencode-large",
            title: "OpenCode Large",
            contextWindowTokens: 128000,
          },
        ],
      },
    });

    const adapter = new OpenCodeAdapter(fakeClient);
    const capabilities = await adapter.initialize();

    expect(capabilities).toMatchObject({
      loadSession: true,
      authMethods: ["oauth", "terminal"],
      supportsTerminalAuth: true,
      session: {
        list: true,
        fork: true,
        resume: false,
        setModel: false,
        stop: false,
      },
    });
    expect(capabilities.models).toEqual([
      {
        id: "opencode-large",
        title: "OpenCode Large",
        contextWindowTokens: 128000,
      },
    ]);
  });

  it("forwards session updates through adapter listener", () => {
    const fakeClient = new FakeACPClient({
      protocolVersion: 1,
      agentCapabilities: {},
      authMethods: [],
    });
    const adapter = new OpenCodeAdapter(fakeClient);
    const events: string[] = [];

    adapter.setSessionUpdateListener((event) => {
      events.push(`${event.sessionId}:${event.update.sessionUpdate}`);
    });

    fakeClient.emitSessionUpdate();

    expect(events).toEqual(["opencode-session-1:agent_message_chunk"]);
  });

  it("normalizes optional model metadata when fields are absent or invalid", async () => {
    const fakeClient = new FakeACPClient({
      protocolVersion: 1,
      agentCapabilities: {},
      authMethods: [],
      _meta: {
        models: [
          {
            id: "",
            title: 42,
            contextWindowTokens: "huge",
          },
          {
            id: "opencode-small",
          },
        ],
      },
    });
    const adapter = new OpenCodeAdapter(fakeClient);

    const capabilities = await adapter.initialize();

    expect(capabilities.models).toEqual([
      {
        id: "unknown-model-0",
        title: undefined,
        contextWindowTokens: null,
      },
      {
        id: "opencode-small",
        title: undefined,
        contextWindowTokens: null,
      },
    ]);
  });
});
