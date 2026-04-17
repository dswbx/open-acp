import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/mainview/App.tsx";
import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog
} from "../../src/shared/providerModels.ts";
import type { ApprovalOutcome } from "../../src/shared/AppRPC.ts";
import type { SmokeBridge } from "../../src/mainview/bridge/SmokeBridge.ts";

class RecordingSmokeBridge implements SmokeBridge {
  readonly createSessionCalls: string[] = [];
  readonly modelCatalogRequests: string[] = [];
  readonly cancelCalls: Array<{ provider: string; sessionId?: string; requestId?: string }> = [];
  readonly approvalResponses: Array<{
    provider: string;
    approvalId: string;
    outcome: ApprovalOutcome;
  }> = [];

  isAvailable(): boolean {
    return true;
  }

  async startSmokeTest() {
    throw new Error("not used");
  }

  async sendChatMessage() {
    throw new Error("not used");
  }

  async cancelChatMessage(
    provider: "codex" | "claude" | "opencode",
    sessionId?: string,
    requestId?: string
  ) {
    this.cancelCalls.push({ provider, sessionId, requestId });
    return {
      provider,
      requestId: requestId ?? "request-1",
      sessionId: sessionId ?? `session-${provider}`,
      cancelledAt: "2026-04-17T00:00:02.000Z"
    };
  }

  async createChatSession(provider: "codex" | "claude" | "opencode") {
    this.createSessionCalls.push(provider);
    return {
      provider,
      sessionId: `session-${provider}`
    };
  }

  async getProviderModelCatalog(provider: "codex" | "claude" | "opencode") {
    this.modelCatalogRequests.push(provider);
    return {
      provider,
      catalog: createEmptyProviderModelCatalog(provider)
    };
  }

  async respondToApproval(
    provider: "codex" | "claude" | "opencode",
    approvalId: string,
    outcome: ApprovalOutcome
  ) {
    this.approvalResponses.push({
      provider,
      approvalId,
      outcome
    });
    return {
      provider,
      approvalId,
      sessionId: `session-${provider}`,
      outcome,
      respondedAt: "2026-04-17T00:00:03.000Z"
    };
  }

  subscribe(): () => void {
    return () => {};
  }
}

describe("App UI shell", () => {
  it("renders the sidebar browse flow instead of draft controls when no session exists", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Agent Orchestrator");
    expect(html).toContain("Sessions");
    expect(html).toContain("New session");
    expect(html).toContain("No sessions yet. Click New session to start.");
    expect(html).toContain("Create or select a session to start chatting.");
    expect(html).not.toContain("Create session");
    expect(html).not.toContain('aria-label="Provider"');
    expect(html).not.toContain('aria-label="Model"');
    expect(html).not.toContain("No chat messages yet");
    expect(html).not.toContain("Type a prompt and press Enter to send.");
    expect(html).toContain("Session inspector");
    expect(html).toContain("Runtime events");
    expect(html).toContain("Theme");
    expect(html).toContain("System");
    expect(html).toContain("h-dvh");
    expect(html).toContain("bg-card");
    expect(html).toContain("border-border");
    expect(html).toContain("text-muted-foreground");
  });

  it("does not fetch provider models on initial mount", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        matchMedia: () => ({
          matches: false,
          addEventListener() {},
          removeEventListener() {}
        })
      }
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          classList: {
            toggle() {}
          }
        }
      }
    });

    try {
      app.setState = (() => undefined) as typeof app.setState;
      app.componentDidMount();
      expect(bridge.modelCatalogRequests).toEqual([]);
      app.componentWillUnmount();
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument
      });
    }
  });

  it("does not fetch provider models when switching providers outside draft mode", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleSelectProvider(provider: "codex" | "claude" | "opencode"): void;
      state: App["state"] & { draftProvider: "codex" | "claude" | "opencode" };
    };

    app.setState = ((updater: any) => {
      const nextState =
        typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState
      };
    }) as typeof app.setState;

    app.handleSelectProvider("claude");

    expect(app.state.draftProvider).toBe("claude");
    expect(bridge.modelCatalogRequests).toEqual([]);
  });

  it("enters draft mode before creating the first session", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleCreateSession(): Promise<void>;
    };

    app.setState = ((updater: any) => {
      const nextState =
        typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState
      };
    }) as typeof app.setState;

    await app.handleCreateSession();

    expect(app.state.isDraftingSession).toBe(true);
    expect(app.state.activeSessionId).toBeUndefined();
    expect(bridge.createSessionCalls).toEqual([]);
    expect(bridge.modelCatalogRequests).toEqual(["codex"]);
  });

  it("keeps the active session selected while drafting a new session", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleCreateSession(): Promise<void>;
    };

    app.setState = ((updater: any) => {
      const nextState =
        typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState
      };
    }) as typeof app.setState;

    app.state = {
      ...app.state,
      isDraftingSession: false,
      activeSessionId: "session-codex",
      selectedProvider: "codex",
      sessions: [
        {
          id: "session-codex",
          provider: "codex",
          title: "Codex session-c",
          model: "default",
          contextWindow: "live session"
        }
      ]
    };

    await app.handleCreateSession();

    expect(app.state.isDraftingSession).toBe(true);
    expect(app.state.activeSessionId).toBe("session-codex");
    expect(bridge.createSessionCalls).toEqual([]);
    expect(bridge.modelCatalogRequests).toEqual(["codex"]);
  });

  it("fetches provider models when switching providers in draft mode", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleCreateSession(): Promise<void>;
      handleSelectProvider(provider: "codex" | "claude" | "opencode"): void;
    };

    app.setState = ((updater: any) => {
      const nextState =
        typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState
      };
    }) as typeof app.setState;

    await app.handleCreateSession();
    app.handleSelectProvider("claude");

    expect(app.state.draftProvider).toBe("claude");
    expect(bridge.modelCatalogRequests).toEqual(["codex", "claude"]);
  });

  it("creates a session from draft mode using the selected provider and hydrates models", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleCreateSession(): Promise<void>;
      handleSelectProvider(provider: "codex" | "claude" | "opencode"): void;
    };

    app.setState = ((updater: any) => {
      const nextState =
        typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState
      };
    }) as typeof app.setState;

    await app.handleCreateSession();
    app.handleSelectProvider("claude");
    await app.handleCreateSession();

    expect(bridge.createSessionCalls).toEqual(["claude"]);
    expect(app.state.isDraftingSession).toBe(false);
    expect(app.state.activeSessionId).toBe("session-claude");
    expect(app.state.selectedProvider).toBe("claude");
    expect(bridge.modelCatalogRequests).toEqual(["codex", "claude", "claude"]);
  });

  it("cancels draft mode when selecting an existing session", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleSelectSession(sessionId: string): void;
    };

    app.setState = ((updater: any) => {
      const nextState =
        typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState
      };
    }) as typeof app.setState;

    app.state = {
      ...app.state,
      isDraftingSession: true,
      draftProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session"
        }
      ]
    };

    app.handleSelectSession("session-claude");

    expect(app.state.isDraftingSession).toBe(false);
    expect(app.state.activeSessionId).toBe("session-claude");
    expect(app.state.selectedProvider).toBe("claude");
    expect(bridge.modelCatalogRequests).toEqual(["claude"]);
  });

  it("uses the draft provider when creating a new session after leaving an active session", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleCreateSession(): Promise<void>;
      handleSelectProvider(provider: "codex" | "claude" | "opencode"): void;
    };

    app.setState = ((updater: any) => {
      const nextState =
        typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState
      };
    }) as typeof app.setState;

    app.state = {
      ...app.state,
      isDraftingSession: false,
      activeSessionId: "session-codex",
      selectedProvider: "codex",
      sessions: [
        {
          id: "session-codex",
          provider: "codex",
          title: "Codex session-c",
          model: "default",
          contextWindow: "live session"
        }
      ]
    };

    await app.handleCreateSession();
    app.handleSelectProvider("claude");
    await app.handleCreateSession();

    expect(bridge.createSessionCalls).toEqual(["claude"]);
    expect(app.state.activeSessionId).toBe("session-claude");
    expect(app.state.selectedProvider).toBe("claude");
  });

  it("keeps the active chat visible while draft controls are open", () => {
    const app = new App({ smokeBridge: new RecordingSmokeBridge() });

    app.state = {
      ...app.state,
      chatInput: "keep typing",
      isDraftingSession: true,
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      draftProvider: "codex",
      chatMessages: [
        {
          id: "u1",
          sessionId: "session-claude",
          author: "user",
          provider: "claude",
          text: "hello",
          timestamp: "2026-04-17T00:00:00.000Z",
          status: "complete"
        }
      ],
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session"
        }
      ]
    };

    const html = renderToStaticMarkup(app.render() as React.ReactElement);

    expect(html).toContain('aria-label="Provider"');
    expect(html).toContain("hello");
    expect(html).toContain("Type a prompt and press Enter to send.");
    expect(html).toContain("Active");
  });

  it("locks provider changes for the active session and shows separate model and thinking selectors", () => {
    const app = new App({ smokeBridge: new RecordingSmokeBridge() });
    const catalog: ProviderModelCatalog = {
      provider: "claude",
      models: [
        {
          id: "gpt-5.4/medium",
          title: "GPT-5.4 (medium)",
          contextWindowTokens: 200_000
        },
        {
          id: "gpt-5.4/high",
          title: "GPT-5.4 (high)",
          contextWindowTokens: 200_000
        }
      ],
      hasAttemptedDiscovery: true,
      source: "discovered"
    };

    app.state = {
      ...app.state,
      isDraftingSession: false,
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      selectedModels: {
        ...app.state.selectedModels,
        claude: "gpt-5.4/high"
      },
      providerModelCatalogs: {
        ...app.state.providerModelCatalogs,
        claude: catalog
      },
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session"
        }
      ]
    };

    const html = renderToStaticMarkup(app.render() as React.ReactElement);

    expect(html).not.toContain('aria-label="Provider"');
    expect(html).toContain('aria-label="Model"');
    expect(html).toContain('aria-label="Thinking level"');
    expect(html).toContain("GPT-5.4");
    expect(html).toContain("Message for Claude");
    expect(html).toContain("Send");
    expect(html.indexOf("Type a prompt and press Enter to send.")).toBeLessThan(
      html.indexOf('aria-label="Model"')
    );
  });

  it("switches the primary composer action to stop while a request is active", () => {
    const app = new App({ smokeBridge: new RecordingSmokeBridge() });

    app.state = {
      ...app.state,
      activeRequestId: "request-12345678",
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session"
        }
      ]
    };

    const html = renderToStaticMarkup(app.render() as React.ReactElement);

    expect(html).toContain(">Stop<");
    expect(html).not.toContain(">Send<");
    expect(html).toContain("working");
  });

  it("renders approval dialog content and the inspector transcript", () => {
    const app = new App({ smokeBridge: new RecordingSmokeBridge() });

    app.state = {
      ...app.state,
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      pendingApprovals: [
        {
          kind: "requested",
          approvalId: "approval-1",
          provider: "claude",
          sessionId: "session-claude",
          requestId: "request-1",
          toolCallId: "tool-1",
          toolKind: "bash",
          rawInput: "npm test",
          locations: [
            {
              path: "src/mainview/App.tsx",
              line: 42
            }
          ],
          options: [
            {
              optionId: "allow-once",
              name: "Allow once",
              kind: "allow_once"
            },
            {
              optionId: "reject-once",
              name: "Reject once",
              kind: "reject_once"
            }
          ],
          timestamp: "2026-04-17T00:00:01.000Z"
        }
      ],
      transcriptEntries: [
        {
          entryId: "e1",
          provider: "claude",
          sessionId: "session-claude",
          direction: "outgoing",
          kind: "request",
          method: "session/prompt",
          requestId: 7,
          summary: "session/prompt",
          json: '{"method":"session/prompt"}',
          timestamp: "2026-04-17T00:00:00.000Z"
        },
        {
          entryId: "e2",
          provider: "claude",
          sessionId: "session-claude",
          direction: "incoming",
          kind: "response",
          method: "session/update",
          requestId: 8,
          summary: "session/update",
          json: '{"method":"session/update"}',
          timestamp: "2026-04-17T00:00:02.000Z"
        }
      ],
      logs: [
        {
          id: "log-1",
          provider: "claude",
          level: "info",
          message: "Oldest runtime event",
          timestamp: "2026-04-17T00:00:00.000Z"
        },
        {
          id: "log-2",
          provider: "claude",
          level: "update",
          message: "Newest runtime event",
          timestamp: "2026-04-17T00:00:02.000Z"
        }
      ],
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session"
        }
      ]
    };

    const html = renderToStaticMarkup(app.render() as React.ReactElement);

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Approval required for bash");
    expect(html).toContain("npm test");
    expect(html).toContain("Allow once");
    expect(html).toContain("ACP transcript");
    expect(html).toContain("session/prompt");
    expect(html).toContain("session/update");
    expect(html).toContain("{&quot;method&quot;:&quot;session/prompt&quot;}");
    expect(html.indexOf("session/update")).toBeLessThan(html.indexOf("session/prompt"));
    expect(html.indexOf("Newest runtime event")).toBeLessThan(
      html.indexOf("Oldest runtime event")
    );
  });
});
