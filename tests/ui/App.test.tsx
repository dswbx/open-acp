import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/mainview/App.tsx";
import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog
} from "../../src/shared/providerModels.ts";
import type {
  ApprovalOutcome,
  ApprovalEventPayload,
  ChatStreamEventPayload,
  GetGitStatusResult,
  SmokeProvider
} from "../../src/shared/AppRPC.ts";
import type { SmokeBridge } from "../../src/mainview/bridge/SmokeBridge.ts";

function createGitStatus(cwd: string): GetGitStatusResult {
  return {
    cwd,
    isGitRepository: true,
    repositoryRoot: cwd,
    branch: "main",
    summary: {
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicted: 0,
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      copied: 0,
      typeChanged: 0
    },
    files: []
  };
}

class RecordingSmokeBridge implements SmokeBridge {
  readonly createSessionCalls: Array<{ provider: SmokeProvider; cwd?: string }> = [];
  readonly modelCatalogRequests: Array<{ provider: SmokeProvider; cwd?: string }> = [];
  readonly gitStatusRequests: string[] = [];
  readonly cancelCalls: Array<{
    provider: string;
    sessionId?: string;
    requestId?: string;
    cwd?: string;
  }> = [];
  readonly approvalResponses: Array<{
    provider: string;
    approvalId: string;
    outcome: ApprovalOutcome;
  }> = [];
  readonly providerCatalogs: Partial<Record<SmokeProvider, ProviderModelCatalog>> = {};
  available = true;
  homeDirectoryPath = "/Users/tester";
  homeDirectoryRequests = 0;

  isAvailable(): boolean {
    return this.available;
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
    requestId?: string,
    cwd?: string
  ) {
    this.cancelCalls.push({ provider, sessionId, requestId, cwd });
    return {
      provider,
      requestId: requestId ?? "request-1",
      sessionId: sessionId ?? `session-${provider}`,
      cancelledAt: "2026-04-17T00:00:02.000Z"
    };
  }

  async createChatSession(provider: "codex" | "claude" | "opencode", cwd?: string) {
    this.createSessionCalls.push({ provider, cwd });
    return {
      provider,
      sessionId: `session-${provider}`,
      cwd: cwd ?? `${this.homeDirectoryPath}/project`
    };
  }

  async getHomeDirectory() {
    this.homeDirectoryRequests += 1;
    return {
      path: this.homeDirectoryPath
    };
  }

  async chooseWorkingDirectory(startingFolder?: string) {
    return {
      path: startingFolder ?? `${this.homeDirectoryPath}/chosen`
    };
  }

  async listDirectory(cwd: string) {
    return {
      cwd,
      entries: []
    };
  }

  async getGitStatus(cwd: string) {
    this.gitStatusRequests.push(cwd);
    return createGitStatus(cwd);
  }

  async getGitDiff(cwd: string) {
    return {
      cwd,
      isGitRepository: true,
      repositoryRoot: cwd,
      text: "",
      files: []
    };
  }

  async getGitFileDiff(cwd: string, path: string, originalPath?: string) {
    return {
      cwd,
      path,
      originalPath,
      text: ""
    };
  }

  async getProviderModelCatalog(provider: "codex" | "claude" | "opencode", cwd?: string) {
    this.modelCatalogRequests.push({ provider, cwd });
    return {
      provider,
      catalog: this.providerCatalogs[provider] ?? createEmptyProviderModelCatalog(provider)
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

type AppHarness = App & {
  handleCreateSession(): Promise<void>;
  handleOpenNewSessionDialog(): void;
  handleSelectSession(sessionId: string): void;
  handleApprovalEvent(payload: ApprovalEventPayload): void;
  handleChatStreamEvent(payload: ChatStreamEventPayload): void;
};

function installSynchronousSetState(app: App): void {
  app.setState = ((updater: any) => {
    const nextState =
      typeof updater === "function" ? updater(app.state, app.props) : updater;
    app.state = {
      ...app.state,
      ...nextState
    };
  }) as typeof app.setState;
}

function mockBrowserGlobals(): () => void {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      clearTimeout,
      setTimeout,
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

  return () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument
    });
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("App UI shell", () => {
  it("renders the sidebar browse flow instead of session-creation controls when no session exists", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Sessions");
    expect(html).toContain("New session");
    expect(html).toContain("No sessions yet. Click New session to start.");
    expect(html).toContain("Create or select a session to start chatting.");
    expect(html).not.toContain("New Session");
    expect(html).not.toContain('aria-label="Provider"');
    expect(html).not.toContain('aria-label="Model"');
    expect(html).not.toContain("No chat messages yet");
    expect(html).not.toContain("Type a prompt. Use @ to mention files. Press Enter to send.");
    expect(html).toContain("Session inspector");
    expect(html).toContain("Runtime events");
    expect(html).toContain("Theme");
    expect(html).toContain("system");
    expect(html).toContain("h-dvh");
    expect(html).toContain("bg-card");
    expect(html).toContain("border-border");
    expect(html).toContain("text-muted-foreground");
  });

  it("does not fetch provider models on initial mount", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge });
    const restoreGlobals = mockBrowserGlobals();

    installSynchronousSetState(app);

    try {
      app.componentDidMount();
      await flushMicrotasks();
      expect(bridge.homeDirectoryRequests).toBe(1);
      expect(app.state.newSessionCwd).toBe("/Users/tester");
      expect(bridge.modelCatalogRequests).toEqual([]);
      app.componentWillUnmount();
    } finally {
      restoreGlobals();
    }
  });

  it("opens the new-session dialog using the selected provider and home directory", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as AppHarness;

    installSynchronousSetState(app);

    app.state = {
      ...app.state,
      homeDirectory: "/Users/tester",
      selectedProvider: "claude"
    };

    app.handleOpenNewSessionDialog();

    expect(app.state.isNewSessionDialogOpen).toBe(true);
    expect(app.state.newSessionProvider).toBe("claude");
    expect(app.state.newSessionCwd).toBe("/Users/tester");
  });

  it("prefills the new-session dialog from the active session when one is selected", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as AppHarness;

    installSynchronousSetState(app);

    app.state = {
      ...app.state,
      activeSessionId: "session-claude",
      selectedProvider: "opencode",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude"
        }
      ]
    };

    app.handleOpenNewSessionDialog();

    expect(app.state.isNewSessionDialogOpen).toBe(true);
    expect(app.state.newSessionProvider).toBe("claude");
    expect(app.state.newSessionCwd).toBe("/workspace/claude");
  });

  it("creates a session from the dialog using the chosen provider and working directory", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as AppHarness;

    installSynchronousSetState(app);

    app.state = {
      ...app.state,
      isNewSessionDialogOpen: true,
      newSessionProvider: "claude",
      newSessionCwd: "/workspace/claude"
    };

    await app.handleCreateSession();
    await flushMicrotasks();

    expect(bridge.createSessionCalls).toEqual([
      {
        provider: "claude",
        cwd: "/workspace/claude"
      }
    ]);
    expect(bridge.gitStatusRequests).toEqual(["/workspace/claude"]);
    expect(bridge.modelCatalogRequests).toEqual([
      {
        provider: "claude",
        cwd: "/workspace/claude"
      }
    ]);
    expect(app.state.isNewSessionDialogOpen).toBe(false);
    expect(app.state.activeSessionId).toBe("session-claude");
    expect(app.state.selectedProvider).toBe("claude");
    expect(app.state.sessions).toEqual([
      expect.objectContaining({
        id: "session-claude",
        provider: "claude",
        cwd: "/workspace/claude"
      })
    ]);
  });

  it("selects an existing session and hydrates its git and model state", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as AppHarness;

    installSynchronousSetState(app);

    app.state = {
      ...app.state,
      activeSessionId: "session-codex",
      selectedProvider: "codex",
      sessions: [
        {
          id: "session-codex",
          provider: "codex",
          title: "Codex session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/codex"
        },
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude"
        }
      ]
    };

    app.handleSelectSession("session-claude");
    await flushMicrotasks();

    expect(app.state.activeSessionId).toBe("session-claude");
    expect(app.state.selectedProvider).toBe("claude");
    expect(bridge.gitStatusRequests).toEqual(["/workspace/claude"]);
    expect(bridge.modelCatalogRequests).toEqual([
      {
        provider: "claude",
        cwd: "/workspace/claude"
      }
    ]);
  });

  it("keeps the active chat visible while the new-session dialog is open", () => {
    const app = new App({ smokeBridge: new RecordingSmokeBridge() });

    app.state = {
      ...app.state,
      chatInput: "keep typing",
      isNewSessionDialogOpen: true,
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      newSessionProvider: "codex",
      newSessionCwd: "/workspace/codex",
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
          contextWindow: "live session",
          cwd: "/workspace/claude"
        }
      ]
    };

    const html = renderToStaticMarkup(app.render() as React.ReactElement);

    expect(html).toContain("hello");
    expect(html).toContain("Type a prompt. Use @ to mention files. Press Enter to send.");
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
          contextWindow: "live session",
          cwd: "/workspace/claude"
        }
      ]
    };

    const html = renderToStaticMarkup(app.render() as React.ReactElement);

    expect(html).not.toContain('aria-label="Provider"');
    expect(html).toContain('aria-label="Model"');
    expect(html).toContain('aria-label="Thinking level"');
    expect(html).toContain("gpt-5.4");
    expect(html).toContain("high");
    expect(html).toContain("Message for Claude");
    expect(html).toContain("Send");
    expect(html.indexOf("Type a prompt. Use @ to mention files. Press Enter to send.")).toBeLessThan(
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
          contextWindow: "live session",
          cwd: "/workspace/claude"
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
          createdAt: "2026-04-17T00:00:00.000Z"
        }
      ],
      transcriptEntries: [
        {
          provider: "claude",
          sessionId: "session-claude",
          direction: "request",
          method: "sendMessage",
          payload: {
            prompt: "Run npm test"
          },
          timestamp: "2026-04-17T00:00:01.000Z"
        }
      ],
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude"
        }
      ]
    };

    const html = renderToStaticMarkup(app.render() as React.ReactElement);

    expect(html).toContain("Approval required to run npm test");
    expect(html).toContain("npm test");
    expect(html).toContain("Allow once");
    expect(html).toContain("Reject once");
    expect(html).toContain("sendMessage");
  });

  it("formats command tool calls from events and preserves them on updates", () => {
    const app = new App({ smokeBridge: new RecordingSmokeBridge() }) as AppHarness;

    installSynchronousSetState(app);

    app.handleChatStreamEvent({
      kind: "tool_call",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:00.000Z",
      toolCallId: "tool-1",
      toolKind: "functions.exec_command",
      toolState: "input-available",
      input: {
        cmd: "git status --short"
      }
    });

    app.handleChatStreamEvent({
      kind: "tool_call_update",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:01.000Z",
      toolCallId: "tool-1",
      toolKind: "functions.exec_command",
      toolState: "output-available",
      output: {
        stdout: "M src/mainview/App.tsx"
      }
    });

    expect(app.state.chatMessages).toEqual([
      expect.objectContaining({
        requestId: "request-1",
        tools: [
          expect.objectContaining({
            toolCallId: "tool-1",
            title: "Run git status --short"
          })
        ]
      })
    ]);
  });

  it("formats approval tool titles and runtime logs from raw input", () => {
    const app = new App({ smokeBridge: new RecordingSmokeBridge() }) as AppHarness;

    installSynchronousSetState(app);

    app.handleApprovalEvent({
      kind: "requested",
      approvalId: "approval-1",
      provider: "claude",
      sessionId: "session-claude",
      cwd: "/workspace/claude",
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
        }
      ],
      timestamp: "2026-04-17T00:00:01.000Z"
    });

    expect(app.state.chatMessages).toEqual([
      expect.objectContaining({
        requestId: "request-1",
        tools: [
          expect.objectContaining({
            toolCallId: "tool-1",
            title: "Run npm test"
          })
        ]
      })
    ]);
    expect(app.state.logs.at(-1)).toEqual(
      expect.objectContaining({
        message: "Approval requested to run npm test."
      })
    );

    const html = renderToStaticMarkup(app.render() as React.ReactElement);
    expect(html).toContain("Approval required to run npm test");
  });
});
