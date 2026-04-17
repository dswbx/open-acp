import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "../../src/core/adapters/AdapterRegistry.ts";
import { AgentAdapter } from "../../src/core/adapters/AgentAdapter.ts";
import { SessionOrchestrator } from "../../src/core/session/SessionOrchestrator.ts";

class FakeAdapter extends AgentAdapter {
  readonly agentId = "claude-code";
  readonly promptCalls: Array<{ sessionId: string; prompt: string }> = [];
  readonly cancelCalls: Array<{ sessionId: string; promptId?: string }> = [];
  private listener?: (event: { sessionId: string; update: { sessionUpdate: string } }) => void;

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
        stop: false
      },
      models: []
    };
  }

  async createSession() {
    return { sessionId: "session-1" };
  }

  async listSessions() {
    return [
      {
        sessionId: "session-1",
        cwd: "/workspace"
      }
    ];
  }

  async sendPrompt(sessionId: string, prompt: string) {
    this.promptCalls.push({ sessionId, prompt });
  }

  async cancelPrompt(sessionId: string, promptId?: string) {
    this.cancelCalls.push({ sessionId, promptId });
  }

  setSessionUpdateListener(
    listener: (event: { sessionId: string; update: { sessionUpdate: string } }) => void
  ) {
    this.listener = listener;
  }

  emitUpdate() {
    if (!this.listener) {
      return;
    }
    this.listener({
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk"
      }
    });
  }
}

describe("SessionOrchestrator", () => {
  it("creates sessions and routes prompts to owning adapter", async () => {
    const registry = new AdapterRegistry();
    const adapter = new FakeAdapter();
    registry.register(adapter);
    const orchestrator = new SessionOrchestrator(registry);

    await orchestrator.initializeAgent("claude-code");
    const session = await orchestrator.createSession({
      agentId: "claude-code",
      cwd: "/workspace"
    });

    await orchestrator.prompt(session.sessionId, "Ship it");
    await orchestrator.cancel(session.sessionId, "prompt-1");

    expect(adapter.promptCalls).toEqual([
      { sessionId: "session-1", prompt: "Ship it" }
    ]);
    expect(adapter.cancelCalls).toEqual([
      { sessionId: "session-1", promptId: "prompt-1" }
    ]);
  });

  it("forwards session update events with owning agent id", async () => {
    const registry = new AdapterRegistry();
    const adapter = new FakeAdapter();
    registry.register(adapter);
    const orchestrator = new SessionOrchestrator(registry);
    const events: string[] = [];

    orchestrator.onSessionUpdate((event) => {
      events.push(`${event.agentId}:${event.sessionId}:${event.update.sessionUpdate}`);
    });

    await orchestrator.createSession({
      agentId: "claude-code",
      cwd: "/workspace"
    });
    adapter.emitUpdate();

    expect(events).toEqual(["claude-code:session-1:agent_message_chunk"]);
  });

  it("throws for unknown session IDs", async () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter());
    const orchestrator = new SessionOrchestrator(registry);

    await expect(orchestrator.prompt("unknown-session", "x")).rejects.toThrow(
      "Unknown session: unknown-session"
    );
  });
});
