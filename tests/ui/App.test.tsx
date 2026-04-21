import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/mainview/App.tsx";
import {
  handleApprovalEvent,
  handleChatStreamEvent,
  handleCreateSession,
  handleOpenNewSessionDialog,
  reconcileActiveSessionSidebarState,
  reconcileGitTabForActiveSession,
  resetReplayAppState,
  handleSelectSession,
  hydrateHomeDirectory,
} from "../../src/mainview/app/appHandlers.ts";
import { hydrateRecordedSession } from "../../src/mainview/app/sessionRecordingRestore.ts";
import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog,
} from "../../src/shared/providerModels.ts";
import type {
  ApprovalOutcome,
  ApprovalEventPayload,
  ChatStreamEventPayload,
  GetGitStatusResult,
  SmokeProvider,
} from "../../src/shared/AppRPC.ts";
import type { RecordedSession } from "../../src/shared/sessionRecording.ts";
import type { SmokeBridge } from "../../src/mainview/bridge/SmokeBridge.ts";
import { useProviderModelStore } from "../../src/mainview/state/providerModelStore.ts";
import { useLoggingStore } from "../../src/mainview/state/loggingStore.ts";
import { useApprovalStore } from "../../src/mainview/state/approvalStore.ts";
import { useChatStore } from "../../src/mainview/state/chatStore.ts";
import { useSessionCreationStore } from "../../src/mainview/state/sessionCreationStore.ts";
import { useSessionStore } from "../../src/mainview/state/sessionStore.ts";
import { useDirectoryStore } from "../../src/mainview/state/directoryStore.ts";
import { useGitStore } from "../../src/mainview/state/gitStore.ts";
import { useRightSidebarStore } from "../../src/mainview/state/rightSidebarStore.ts";

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
      typeChanged: 0,
    },
    files: [],
  };
}

class RecordingSmokeBridge implements SmokeBridge {
  readonly createSessionCalls: Array<{ provider: SmokeProvider; cwd?: string }> = [];
  readonly modelCatalogRequests: Array<{ provider: SmokeProvider; cwd?: string }> = [];
  readonly gitStatusRequests: string[] = [];
  readonly availableCommandsRequests: Array<{
    provider: SmokeProvider;
    sessionId?: string;
    cwd?: string;
  }> = [];
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
    cwd?: string,
  ) {
    this.cancelCalls.push({ provider, sessionId, requestId, cwd });
    return {
      provider,
      requestId: requestId ?? "request-1",
      sessionId: sessionId ?? `session-${provider}`,
      cancelledAt: "2026-04-17T00:00:02.000Z",
    };
  }

  async createChatSession(provider: "codex" | "claude" | "opencode", cwd?: string) {
    this.createSessionCalls.push({ provider, cwd });
    return {
      provider,
      sessionId: `session-${provider}`,
      cwd: cwd ?? `${this.homeDirectoryPath}/project`,
    };
  }

  async getHomeDirectory() {
    this.homeDirectoryRequests += 1;
    return {
      path: this.homeDirectoryPath,
    };
  }

  async chooseWorkingDirectory(startingFolder?: string) {
    return {
      path: startingFolder ?? `${this.homeDirectoryPath}/chosen`,
    };
  }

  async listDirectory(cwd: string) {
    return {
      cwd,
      entries: [],
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
      files: [],
    };
  }

  async getGitFileDiff(cwd: string, path: string, originalPath?: string) {
    return {
      cwd,
      path,
      originalPath,
      text: "",
    };
  }

  async getProviderModelCatalog(provider: "codex" | "claude" | "opencode", cwd?: string) {
    this.modelCatalogRequests.push({ provider, cwd });
    return {
      provider,
      catalog: this.providerCatalogs[provider] ?? createEmptyProviderModelCatalog(provider),
    };
  }

  async getAvailableCommands(
    provider: "codex" | "claude" | "opencode",
    sessionId?: string,
    cwd?: string,
  ) {
    this.availableCommandsRequests.push({ provider, sessionId, cwd });
    return {
      provider,
      sessionId: sessionId ?? `session-${provider}`,
      commands: [],
      fetchedAt: "2026-04-17T00:00:04.000Z",
    };
  }

  async respondToApproval(
    provider: "codex" | "claude" | "opencode",
    approvalId: string,
    outcome: ApprovalOutcome,
  ) {
    this.approvalResponses.push({
      provider,
      approvalId,
      outcome,
    });
    return {
      provider,
      approvalId,
      sessionId: `session-${provider}`,
      outcome,
      respondedAt: "2026-04-17T00:00:03.000Z",
    };
  }

  subscribe(): () => void {
    return () => {};
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function renderAppHtml(bridge: SmokeBridge): string {
  return renderToStaticMarkup(<App smokeBridge={bridge} />);
}

describe("App UI shell", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useApprovalStore.getState().reset();
    useLoggingStore.getState().reset();
    useSessionCreationStore.getState().reset();
    useDirectoryStore.getState().reset();
    useGitStore.getState().reset();
    useProviderModelStore.getState().reset();
    useSessionStore.getState().reset();
    useRightSidebarStore.getState().reset();
  });

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
    expect(html).not.toContain(
      "Type a prompt. Use @ to mention files, / for commands. Press Enter to send.",
    );
    expect(html).toContain("Session inspector");
    expect(html).toContain("Runtime events");
    expect(html).toContain("Theme");
    expect(html).toContain("system");
    expect(html).toContain("h-dvh");
    expect(html).toContain("bg-card");
    expect(html).toContain("border-border");
    expect(html).toContain("text-muted-foreground");
  });

  it("does not fetch provider models when hydrating the home directory", async () => {
    const bridge = new RecordingSmokeBridge();

    await hydrateHomeDirectory(bridge);
    await flushMicrotasks();

    expect(bridge.homeDirectoryRequests).toBe(1);
    expect(useSessionCreationStore.getState().newSessionCwd).toBe("/Users/tester");
    expect(bridge.modelCatalogRequests).toEqual([]);
  });

  it("hydrates a recorded session into the web UI state", () => {
    const bridge = new RecordingSmokeBridge();
    const recording: RecordedSession = {
      metadata: {
        provider: "codex",
        cwd: "/workspace/project",
        sessionId: "recorded-session-1",
        model: "gpt-5.3-codex/medium",
      },
      messages: [
        {
          timestamp: "2026-04-17T00:00:01.000Z",
          type: "user_message",
          payload: {
            requestId: "request-1",
            provider: "codex",
            model: "gpt-5.3-codex/medium",
            text: "Show me the state.",
          },
        },
        {
          timestamp: "2026-04-17T00:00:03.000Z",
          type: "assistant_message",
          payload: {
            requestId: "request-1",
            provider: "codex",
            model: "gpt-5.3-codex/medium",
            text: "Here is the restored answer.",
            reasoningText: "I checked the saved stream first.",
            status: "complete",
          },
        },
      ],
      events: [
        {
          type: "chatStreamEvent",
          payload: {
            requestId: "request-1",
            provider: "codex",
            sessionId: "recorded-session-1",
            cwd: "/workspace/project",
            kind: "session_ready",
            timestamp: "2026-04-17T00:00:00.000Z",
          },
        },
        {
          type: "chatStreamEvent",
          payload: {
            requestId: "request-1",
            provider: "codex",
            sessionId: "recorded-session-1",
            cwd: "/workspace/project",
            kind: "agent_thought_chunk",
            text: "I checked the saved stream first.",
            timestamp: "2026-04-17T00:00:01.500Z",
          },
        },
        {
          type: "chatStreamEvent",
          payload: {
            requestId: "request-1",
            provider: "codex",
            sessionId: "recorded-session-1",
            cwd: "/workspace/project",
            kind: "agent_chunk",
            text: "Here is the restored answer.",
            timestamp: "2026-04-17T00:00:02.000Z",
          },
        },
        {
          type: "chatStreamEvent",
          payload: {
            requestId: "request-1",
            provider: "codex",
            sessionId: "recorded-session-1",
            cwd: "/workspace/project",
            kind: "reasoning_update",
            eventId: "event-1",
            updateType: "thought",
            summary: "Checked the saved events.",
            timestamp: "2026-04-17T00:00:02.500Z",
          },
        },
        {
          type: "agentTranscriptEvent",
          payload: {
            entryId: "entry-1",
            provider: "codex",
            sessionId: "recorded-session-1",
            direction: "outgoing",
            kind: "request",
            method: "session/prompt",
            requestId: 1,
            summary: "session/prompt",
            json: "{}",
            timestamp: "2026-04-17T00:00:01.000Z",
          },
        },
      ],
    };

    hydrateRecordedSession(recording, bridge);

    expect(useSessionStore.getState().activeSessionId).toBe("recorded-session-1");
    expect(useSessionStore.getState().sessions).toMatchObject([
      {
        id: "recorded-session-1",
        provider: "codex",
        cwd: "/workspace/project",
        model: "gpt-5.3-codex/medium",
      },
    ]);
    const messagesAfterRestore = useChatStore.getState().chatMessages;
    expect(messagesAfterRestore).toMatchObject([
      {
        author: "user",
        requestId: "request-1",
        text: "Show me the state.",
        status: "complete",
      },
      {
        author: "assistant",
        requestId: "request-1",
        status: "complete",
      },
    ]);
    const assistantBlocks = messagesAfterRestore[1]?.blocks ?? [];
    expect(assistantBlocks).toMatchObject([
      { kind: "reasoning", text: "I checked the saved stream first." },
      { kind: "text", text: "Here is the restored answer." },
      {
        kind: "reasoning-steps",
        steps: [{ id: "event-1", summary: "Checked the saved events." }],
      },
    ]);
    expect(useLoggingStore.getState().transcriptEntries).toHaveLength(1);
    const textBlocks = assistantBlocks.filter((block) => block.kind === "text");
    expect(textBlocks).toHaveLength(1);
  });

  it("opens the new-session dialog using the selected provider and home directory", () => {
    useDirectoryStore.getState().setHomeDirectory("/Users/tester");
    useSessionStore.getState().setSelectedProvider("claude");

    handleOpenNewSessionDialog();

    const creationState = useSessionCreationStore.getState();
    expect(creationState.isNewSessionDialogOpen).toBe(true);
    expect(creationState.newSessionProvider).toBe("claude");
    expect(creationState.newSessionCwd).toBe("/Users/tester");
  });

  it("prefills the new-session dialog from the active session when one is selected", () => {
    useSessionStore.setState({
      activeSessionId: "session-claude",
      selectedProvider: "opencode",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });

    handleOpenNewSessionDialog();

    const creationState2 = useSessionCreationStore.getState();
    expect(creationState2.isNewSessionDialogOpen).toBe(true);
    expect(creationState2.newSessionProvider).toBe("claude");
    expect(creationState2.newSessionCwd).toBe("/workspace/claude");
  });

  it("creates a session from the dialog using the chosen provider and working directory", async () => {
    const bridge = new RecordingSmokeBridge();

    useSessionCreationStore.setState({
      isNewSessionDialogOpen: true,
      newSessionProvider: "claude",
      newSessionCwd: "/workspace/claude",
    });

    await handleCreateSession(bridge);
    await flushMicrotasks();

    expect(bridge.createSessionCalls).toEqual([
      {
        provider: "claude",
        cwd: "/workspace/claude",
      },
    ]);
    expect(bridge.gitStatusRequests).toEqual(["/workspace/claude"]);
    expect(bridge.modelCatalogRequests).toEqual([
      {
        provider: "claude",
        cwd: "/workspace/claude",
      },
    ]);
    expect(useSessionCreationStore.getState().isNewSessionDialogOpen).toBe(false);
    expect(useSessionStore.getState().activeSessionId).toBe("session-claude");
    expect(useSessionStore.getState().selectedProvider).toBe("claude");
    expect(useSessionStore.getState().sessions).toEqual([
      expect.objectContaining({
        id: "session-claude",
        provider: "claude",
        cwd: "/workspace/claude",
      }),
    ]);
  });

  it("selects an existing session and hydrates its git and model state", async () => {
    const bridge = new RecordingSmokeBridge();

    useSessionStore.setState({
      activeSessionId: "session-codex",
      selectedProvider: "codex",
      sessions: [
        {
          id: "session-codex",
          provider: "codex",
          title: "Codex session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/codex",
        },
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });

    handleSelectSession(bridge, "session-claude");
    await flushMicrotasks();

    expect(useSessionStore.getState().activeSessionId).toBe("session-claude");
    expect(useSessionStore.getState().selectedProvider).toBe("claude");
    expect(bridge.gitStatusRequests).toEqual(["/workspace/claude"]);
    expect(bridge.modelCatalogRequests).toEqual([
      {
        provider: "claude",
        cwd: "/workspace/claude",
      },
    ]);
  });

  it("resets replay-visible state while preserving the discovered home directory", () => {
    useDirectoryStore.getState().setHomeDirectory("/Users/tester");
    useDirectoryStore.getState().completeLoad("/workspace/claude", [
      {
        name: "src",
        path: "/workspace/claude/src",
        kind: "directory",
      },
    ]);
    useDirectoryStore.getState().failLoad("/workspace/broken", "Directory unavailable");
    useGitStore.getState().completeLoad("/workspace/claude", createGitStatus("/workspace/claude"));
    useProviderModelStore.getState().setCatalog("claude", {
      provider: "claude",
      models: [{ id: "claude-sonnet-4-5", title: "Sonnet 4.5", contextWindowTokens: null }],
      hasAttemptedDiscovery: true,
      source: "discovered",
    });
    useProviderModelStore.getState().setSelectedModel("claude", "claude-sonnet-4-5");
    useChatStore.getState().setChatInput("stale input");
    useChatStore.getState().setChatMessages(() => [
      {
        id: "u1",
        sessionId: "session-claude",
        author: "user",
        provider: "claude",
        text: "hello",
        timestamp: "2026-04-17T00:00:00.000Z",
        status: "complete",
      },
    ]);
    useApprovalStore.getState().upsertApproval({
      kind: "requested",
      approvalId: "approval-1",
      provider: "claude",
      sessionId: "session-claude",
      requestId: "request-1",
      toolCallId: "tool-1",
      toolKind: "bash",
      rawInput: "bun run typecheck",
      locations: [],
      options: [
        {
          optionId: "allow-once",
          name: "Allow once",
          kind: "allow_once",
        },
      ],
      createdAt: "2026-04-17T00:00:00.000Z",
    });
    useLoggingStore.getState().appendLog({
      provider: "claude",
      level: "info",
      message: "stale log",
      timestamp: "2026-04-17T00:00:01.000Z",
    });
    useLoggingStore.getState().appendTranscriptEntry({
      provider: "claude",
      sessionId: "session-claude",
      direction: "request",
      method: "prompt",
      payload: { prompt: "hello" },
      timestamp: "2026-04-17T00:00:01.000Z",
    });
    useSessionStore.setState({
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      draftProvider: "claude",
      isDraftingSession: true,
    });
    useSessionCreationStore.setState({
      newSessionProvider: "claude",
      newSessionCwd: "/workspace/claude",
      isCreatingSession: true,
      isChoosingWorkingDirectory: true,
      isNewSessionDialogOpen: true,
    });
    useRightSidebarStore.getState().openTab("git");
    useRightSidebarStore.getState().setAvailableCommands("session-claude", []);

    resetReplayAppState();

    expect(useDirectoryStore.getState().homeDirectory).toBe("/Users/tester");
    expect(useDirectoryStore.getState().entriesByCwd).toEqual({});
    expect(useDirectoryStore.getState().errorsByCwd).toEqual({});
    expect(useGitStore.getState().statusByCwd).toEqual({});
    expect(useChatStore.getState().chatMessages).toEqual([]);
    expect(useChatStore.getState().chatInput).toBe("");
    expect(useApprovalStore.getState().pendingApprovals).toEqual([]);
    expect(useLoggingStore.getState().logs).toEqual([]);
    expect(useLoggingStore.getState().transcriptEntries).toEqual([]);
    expect(useProviderModelStore.getState().selected).toEqual({
      codex: "",
      claude: "",
      qwen: "",
      opencode: "",
    });
    expect(useProviderModelStore.getState().catalogs.claude.models).toEqual([]);
    expect(useSessionStore.getState().sessions).toEqual([]);
    expect(useSessionStore.getState().activeSessionId).toBeUndefined();
    expect(useSessionCreationStore.getState()).toMatchObject({
      newSessionProvider: "codex",
      newSessionCwd: "/Users/tester",
      isCreatingSession: false,
      isChoosingWorkingDirectory: false,
      isNewSessionDialogOpen: false,
    });
    expect(useRightSidebarStore.getState().openTabs).toEqual(["inspector"]);
    expect(useRightSidebarStore.getState().availableCommandsBySession).toEqual({});
  });

  it("opens the git tab after async git status arrives, and only once per session", () => {
    const gitAutoOpenedSessions = new Set<string>();
    useSessionStore.setState({
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });

    expect(reconcileGitTabForActiveSession(gitAutoOpenedSessions)).toBe(false);
    expect(useRightSidebarStore.getState().openTabs).toEqual(["inspector"]);

    useGitStore.getState().completeLoad("/workspace/claude", createGitStatus("/workspace/claude"));

    expect(reconcileGitTabForActiveSession(gitAutoOpenedSessions)).toBe(true);
    expect(useRightSidebarStore.getState().openTabs).toEqual(["inspector", "git"]);

    expect(reconcileGitTabForActiveSession(gitAutoOpenedSessions)).toBe(false);
    expect(useRightSidebarStore.getState().openTabs).toEqual(["inspector", "git"]);
  });

  it("hydrates available commands when the first session becomes active", async () => {
    const bridge = new RecordingSmokeBridge();

    useSessionStore.setState({
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });

    reconcileActiveSessionSidebarState({
      bridge,
      previousActiveSessionId: undefined,
      previousActiveCwd: "",
      filesAutoOpenedSessions: new Set<string>(),
      gitAutoOpenedSessions: new Set<string>(),
    });
    await flushMicrotasks();

    expect(bridge.availableCommandsRequests).toEqual([
      {
        provider: "claude",
        sessionId: "session-claude",
        cwd: "/workspace/claude",
      },
    ]);
  });

  it("keeps the active chat visible while the new-session dialog is open", () => {
    useChatStore.getState().setChatInput("keep typing");
    useChatStore.getState().setChatMessages(() => [
      {
        id: "u1",
        sessionId: "session-claude",
        author: "user",
        provider: "claude",
        text: "hello",
        timestamp: "2026-04-17T00:00:00.000Z",
        status: "complete",
      },
    ]);
    useSessionCreationStore.setState({
      isNewSessionDialogOpen: true,
      newSessionProvider: "codex",
      newSessionCwd: "/workspace/codex",
    });
    useSessionStore.setState({
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });

    const html = renderAppHtml(new RecordingSmokeBridge());

    expect(html).toContain("hello");
    expect(html).toContain(
      "Type a prompt. Use @ to mention files, / for commands. Press Enter to send.",
    );
    expect(html).toContain("Active");
  });

  it("locks provider changes for the active session and shows separate model and thinking selectors", () => {
    const catalog: ProviderModelCatalog = {
      provider: "claude",
      models: [
        {
          id: "gpt-5.4/medium",
          title: "GPT-5.4 (medium)",
          contextWindowTokens: 200_000,
        },
        {
          id: "gpt-5.4/high",
          title: "GPT-5.4 (high)",
          contextWindowTokens: 200_000,
        },
      ],
      hasAttemptedDiscovery: true,
      source: "discovered",
    };

    useProviderModelStore.getState().setCatalog("claude", catalog);
    useProviderModelStore.getState().setSelectedModel("claude", "gpt-5.4/high");
    useSessionStore.setState({
      isDraftingSession: false,
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });

    const html = renderAppHtml(new RecordingSmokeBridge());

    expect(html).not.toContain('aria-label="Provider"');
    expect(html).toContain('aria-label="Model"');
    expect(html).toContain('aria-label="Thinking level"');
    expect(html).toContain("gpt-5.4");
    expect(html).toContain("high");
    expect(html).toContain("Message for Claude");
    expect(html).toContain("Send");
    expect(
      html.indexOf("Type a prompt. Use @ to mention files, / for commands. Press Enter to send."),
    ).toBeLessThan(html.indexOf('aria-label="Model"'));
  });

  it("switches the primary composer action to stop while a request is active", () => {
    useChatStore.getState().setActiveRequestId("request-12345678");
    useSessionStore.setState({
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });

    const html = renderAppHtml(new RecordingSmokeBridge());

    expect(html).toContain(">Stop<");
    expect(html).not.toContain(">Send<");
    expect(html).toContain("working");
  });

  it("renders approval dialog content and the inspector transcript", () => {
    useLoggingStore.getState().appendTranscriptEntry({
      provider: "claude",
      sessionId: "session-claude",
      direction: "request",
      method: "sendMessage",
      payload: {
        prompt: "Run npm test",
      },
      timestamp: "2026-04-17T00:00:01.000Z",
    });
    useApprovalStore.getState().upsertApproval({
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
          line: 42,
        },
      ],
      options: [
        {
          optionId: "allow-once",
          name: "Allow once",
          kind: "allow_once",
        },
        {
          optionId: "reject-once",
          name: "Reject once",
          kind: "reject_once",
        },
      ],
      createdAt: "2026-04-17T00:00:00.000Z",
    });
    useSessionStore.setState({
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });

    const html = renderAppHtml(new RecordingSmokeBridge());

    expect(html).toContain("Approval required to run npm test");
    expect(html).toContain("npm test");
    expect(html).toContain("Allow once");
    expect(html).toContain("Reject once");
    expect(html).toContain("sendMessage");
  });

  it("formats command tool calls from events and preserves them on updates", () => {
    const bridge = new RecordingSmokeBridge();

    const toolCallPayload: ChatStreamEventPayload = {
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
        cmd: "git status --short",
      },
    };
    handleChatStreamEvent(bridge, toolCallPayload);

    const toolCallUpdatePayload: ChatStreamEventPayload = {
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
        stdout: "M src/mainview/App.tsx",
      },
    };
    handleChatStreamEvent(bridge, toolCallUpdatePayload);

    expect(useChatStore.getState().chatMessages).toEqual([
      expect.objectContaining({
        requestId: "request-1",
        blocks: [
          expect.objectContaining({
            kind: "tool",
            tool: expect.objectContaining({
              toolCallId: "tool-1",
              title: "Run git status --short",
            }),
          }),
        ],
      }),
    ]);
  });

  it("streams chunks, reasoning, and tool calls into ordered blocks", () => {
    const bridge = new RecordingSmokeBridge();

    handleChatStreamEvent(bridge, {
      kind: "agent_chunk",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:00.000Z",
      text: "Got it, I will inspect the renderer first.",
    });
    handleChatStreamEvent(bridge, {
      kind: "tool_call",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:01.000Z",
      toolCallId: "tool-1",
      toolKind: "functions.exec_command",
      toolState: "input-available",
      input: {
        cmd: "sed -n '1,120p' src/mainview/components/ChatSurface.tsx",
      },
    });
    handleChatStreamEvent(bridge, {
      kind: "agent_chunk",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:01.500Z",
      text: " I found the renderer and I am checking the store next.",
    });
    handleChatStreamEvent(bridge, {
      kind: "tool_call",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:02.000Z",
      toolCallId: "tool-2",
      toolKind: "functions.exec_command",
      toolState: "input-available",
      input: {
        cmd: "sed -n '1,120p' src/mainview/app/appHandlers.ts",
      },
    });
    handleChatStreamEvent(bridge, {
      kind: "tool_call_update",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:02.250Z",
      toolCallId: "tool-2",
      toolKind: "functions.exec_command",
      toolState: "output-available",
      output: {
        stdout: "handler source",
      },
    });
    handleChatStreamEvent(bridge, {
      kind: "agent_chunk",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:02.500Z",
      text: "The renderer now keeps progress text in reasoning and final text visible.",
    });

    const streamingBlocks = useChatStore.getState().chatMessages[0]?.blocks ?? [];
    expect(streamingBlocks.map((block) => block.kind)).toEqual([
      "text",
      "tool",
      "text",
      "tool",
      "text",
    ]);
    expect(streamingBlocks[0]).toMatchObject({
      kind: "text",
      text: "Got it, I will inspect the renderer first.",
    });
    expect(streamingBlocks[2]).toMatchObject({
      kind: "text",
      text: " I found the renderer and I am checking the store next.",
    });
    expect(streamingBlocks[4]).toMatchObject({
      kind: "text",
      text: "The renderer now keeps progress text in reasoning and final text visible.",
    });

    handleChatStreamEvent(bridge, {
      kind: "agent_complete",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:03.000Z",
      stopReason: "completed",
    });

    const completedMessage = useChatStore.getState().chatMessages[0];
    expect(completedMessage).toMatchObject({
      requestId: "request-1",
      status: "complete",
    });
    expect(completedMessage?.blocks?.map((block) => block.kind)).toEqual([
      "text",
      "tool",
      "text",
      "tool",
      "text",
    ]);
    const toolIds = (completedMessage?.blocks ?? [])
      .filter((block) => block.kind === "tool")
      .map((block) => (block.kind === "tool" ? block.tool.toolCallId : ""));
    expect(toolIds).toEqual(["tool-1", "tool-2"]);
  });

  it("opens a new reasoning block each time thought chunks follow a different notification", () => {
    const bridge = new RecordingSmokeBridge();

    handleChatStreamEvent(bridge, {
      kind: "agent_thought_chunk",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:00.000Z",
      text: "First thought. ",
    });
    handleChatStreamEvent(bridge, {
      kind: "agent_thought_chunk",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:00.250Z",
      text: "Still thinking.",
    });
    handleChatStreamEvent(bridge, {
      kind: "tool_call",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:01.000Z",
      toolCallId: "tool-1",
      toolKind: "functions.exec_command",
      toolState: "input-available",
      input: { cmd: "ls" },
    });
    handleChatStreamEvent(bridge, {
      kind: "agent_thought_chunk",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:02.000Z",
      text: "New thought after tool.",
    });

    const blocks = useChatStore.getState().chatMessages[0]?.blocks ?? [];
    expect(blocks.map((block) => block.kind)).toEqual(["reasoning", "tool", "reasoning"]);
    expect(blocks[0]).toMatchObject({
      kind: "reasoning",
      text: "First thought. Still thinking.",
    });
    expect(blocks[2]).toMatchObject({ kind: "reasoning", text: "New thought after tool." });
  });

  it("keeps no-tool assistant chunks as a single text block on completion", () => {
    const bridge = new RecordingSmokeBridge();

    handleChatStreamEvent(bridge, {
      kind: "agent_chunk",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:00.000Z",
      text: "This is the answer.",
    });
    handleChatStreamEvent(bridge, {
      kind: "agent_complete",
      requestId: "request-1",
      provider: "codex",
      sessionId: "session-codex",
      cwd: "/workspace/codex",
      timestamp: "2026-04-17T00:00:01.000Z",
      stopReason: "completed",
    });

    expect(useChatStore.getState().chatMessages).toEqual([
      expect.objectContaining({
        requestId: "request-1",
        status: "complete",
        blocks: [expect.objectContaining({ kind: "text", text: "This is the answer." })],
      }),
    ]);
  });

  it("formats approval tool titles and runtime logs from raw input", () => {
    const approvalPayload: ApprovalEventPayload = {
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
          line: 42,
        },
      ],
      options: [
        {
          optionId: "allow-once",
          name: "Allow once",
          kind: "allow_once",
        },
      ],
      timestamp: "2026-04-17T00:00:01.000Z",
    };
    handleApprovalEvent(approvalPayload);

    expect(useChatStore.getState().chatMessages).toEqual([
      expect.objectContaining({
        requestId: "request-1",
        blocks: [
          expect.objectContaining({
            kind: "tool",
            tool: expect.objectContaining({
              toolCallId: "tool-1",
              title: "Run npm test",
            }),
          }),
        ],
      }),
    ]);
    expect(useLoggingStore.getState().logs.at(-1)).toEqual(
      expect.objectContaining({
        message: "Approval requested to run npm test.",
      }),
    );

    useSessionStore.setState({
      activeSessionId: "session-claude",
      selectedProvider: "claude",
      sessions: [
        {
          id: "session-claude",
          provider: "claude",
          title: "Claude session-c",
          model: "default",
          contextWindow: "live session",
          cwd: "/workspace/claude",
        },
      ],
    });
    const html = renderAppHtml(new RecordingSmokeBridge());
    expect(html).toContain("Approval required to run npm test");
  });
});
