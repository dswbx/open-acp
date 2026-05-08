import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProviderSessionModeConfig } from "../../src/shared/sessionModes.ts";
import { createRpcRequestHandlers } from "../../src/bun/rpcHandlers.ts";
import { SessionTranscriptStore } from "../../src/bun/SessionTranscriptStore.ts";
import { createWorkspaceStore } from "../../src/bun/workspaceStore.ts";

vi.mock("electrobun/bun", () => ({
  Utils: {
    openFileDialog: vi.fn(),
  },
}));

const tempDirectories: string[] = [];

describe("rpcHandlers workspace sessions", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("creates and lists workspaces through RPC handlers", async () => {
    const { handlers } = createTestHandlers();

    await expect(
      handlers.createWorkspace({ name: "Backend", rootPath: "/Users/tester/Projects/bknd" }),
    ).resolves.toMatchObject({
      workspace: {
        id: "backend",
        rootPath: "/Users/tester/Projects/bknd",
      },
    });
    await expect(handlers.listWorkspaces()).resolves.toMatchObject({
      workspaces: [expect.objectContaining({ id: "backend" })],
    });
  });

  it("creates sessions using the workspace root instead of the caller cwd", async () => {
    const { handlers, runtimeManager } = createTestHandlers();
    await handlers.createWorkspace({ name: "Backend", rootPath: "/Users/tester/Projects/bknd" });

    await expect(
      handlers.createChatSession({
        provider: "codex",
        workspaceId: "backend",
        cwd: "/ignored",
        mode: "plan",
      }),
    ).resolves.toMatchObject({
      provider: "codex",
      workspaceId: "backend",
      cwd: "/Users/tester/Projects/bknd",
      sessionId: "session-codex-backend",
    });
    expect(runtimeManager.ensureCalls).toEqual([
      {
        provider: "codex",
        cwd: "/Users/tester/Projects/bknd",
        options: { workspaceId: "backend" },
      },
    ]);
  });

  it("reads workspace-scoped stored recordings", async () => {
    const { handlers, transcriptStore } = createTestHandlers();
    await transcriptStore.writeMetadata({
      cwd: "/Users/tester/Projects/bknd",
      workspaceId: "backend",
      sessionId: "stored-session",
      metadata: {
        provider: "codex",
        cwd: "/Users/tester/Projects/bknd",
        sessionId: "stored-session",
        workspaceId: "backend",
      },
    });
    await transcriptStore.appendRecord({
      cwd: "/Users/tester/Projects/bknd",
      workspaceId: "backend",
      sessionId: "stored-session",
      record: {
        timestamp: "2026-05-07T00:00:00.000Z",
        type: "user_message",
        payload: { provider: "codex", text: "hello" },
      },
    });

    await expect(
      handlers.getStoredSessionRecording({
        sessionId: "stored-session",
        workspaceId: "backend",
      }),
    ).resolves.toMatchObject({
      recording: {
        metadata: {
          sessionId: "stored-session",
          workspaceId: "backend",
        },
        messages: [expect.objectContaining({ type: "user_message" })],
      },
    });
  });
});

function createTestHandlers() {
  const root = path.join(os.tmpdir(), `open-acp-rpc-${crypto.randomUUID()}`);
  tempDirectories.push(root);
  const homeRoot = path.join(root, ".open-acp");
  const transcriptStore = new SessionTranscriptStore({ homeRoot });
  const runtimeManager = createRuntimeManager();
  const handlers = createRpcRequestHandlers({
    defaultWorkspaceCwd: "/fallback",
    replayFixtureHarness: undefined,
    providerRuntimeManager: runtimeManager,
    providerModelCatalogStore: { get: () => ({ provider: "codex", models: [] }) },
    appUpdaterManager: {},
    uiLayoutStateStore: {},
    appSettingsStore: {},
    workspaceStore: createWorkspaceStore({ homeRoot }),
    sessionReplay: {
      writeMetadata: () => {},
      appendTranscriptRecord: () => {},
    },
    sessionTranscriptStore: transcriptStore,
    emitSmokeEvent: () => {},
    emitChatStreamEvent: () => {},
    emitApprovalEvent: () => {},
    emitUserInputEvent: () => {},
    executeSmokeRun: () => {},
    runChatPrompt: () => {},
  } as never);
  return { handlers, runtimeManager, transcriptStore };
}

function createRuntimeManager() {
  const ensureCalls: Array<{
    provider: string;
    cwd: string;
    options: unknown;
  }> = [];
  return {
    ensureCalls,
    getRuntime: () => undefined,
    ensureProviderRuntime: async (
      provider: "codex",
      cwd: string,
      options: { workspaceId?: string },
    ) => {
      ensureCalls.push({ provider, cwd, options });
      const sessionId = `session-${provider}-${options.workspaceId ?? "default"}`;
      return {
        provider,
        workspaceId: options.workspaceId,
        cwd,
        sessionId,
        activeRequestId: undefined,
        transportKind: "codex-native",
        modeState: { publicState: { normalizedMode: "build" } },
      };
    },
    getSessionModeConfig: (runtime: { provider: "codex"; sessionId: string; cwd: string }) =>
      createDefaultProviderSessionModeConfig(runtime.provider, runtime.sessionId, runtime.cwd),
    setSessionMode: async (
      runtime: { provider: "codex"; sessionId: string; cwd: string },
      mode: "build" | "plan",
    ) =>
      createDefaultProviderSessionModeConfig(
        runtime.provider,
        runtime.sessionId,
        runtime.cwd,
        mode,
      ),
  };
}
