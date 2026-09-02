import path from "node:path";
import { createServer } from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type {
  AppTestAction,
  AppTestSnapshot,
  AppTestWaitForStateParams,
} from "../../src/shared/e2e.ts";

const WORKSPACE_ROOT = process.cwd();

interface ControlResponse<T> {
  ok: boolean;
  error?: string;
  snapshot?: T;
  metadata?: unknown;
}

async function getAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate an ephemeral port."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function matchesWaitState(snapshot: AppTestSnapshot, params: AppTestWaitForStateParams): boolean {
  if (params.activeSessionId !== undefined && snapshot.activeSessionId !== params.activeSessionId) {
    return false;
  }
  if (
    params.hasActiveRequest !== undefined &&
    Boolean(snapshot.activeRequestId) !== params.hasActiveRequest
  ) {
    return false;
  }
  if (params.sessionCount !== undefined && snapshot.sessions.length !== params.sessionCount) {
    return false;
  }
  if (
    params.visibleMessageCount !== undefined &&
    snapshot.visibleMessages.length !== params.visibleMessageCount
  ) {
    return false;
  }
  if (
    params.pendingApprovalCount !== undefined &&
    snapshot.pendingApprovals.length !== params.pendingApprovalCount
  ) {
    return false;
  }

  const lastMessage = snapshot.visibleMessages[snapshot.visibleMessages.length - 1];
  if (params.lastMessageAuthor !== undefined && lastMessage?.author !== params.lastMessageAuthor) {
    return false;
  }
  if (params.lastMessageStatus !== undefined && lastMessage?.status !== params.lastMessageStatus) {
    return false;
  }
  return true;
}

class E2EAppHarness {
  private child?: ChildProcessWithoutNullStreams;
  private readonly logs: string[] = [];
  private controlPort?: number;

  private get controlBaseUrl(): string {
    if (!this.controlPort) {
      throw new Error("E2E control port has not been assigned yet.");
    }
    return `http://127.0.0.1:${this.controlPort}`;
  }

  async start(): Promise<void> {
    this.controlPort = await getAvailablePort();
    const electrobunBin = path.join(
      WORKSPACE_ROOT,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "electrobun.cmd" : "electrobun",
    );
    this.child = spawn(electrobunBin, ["dev"], {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
        ACP_E2E: "1",
        ACP_E2E_PORT: String(this.controlPort),
      },
      stdio: "pipe",
    });
    this.child.stdout.on("data", (chunk) => {
      this.logs.push(chunk.toString());
    });
    this.child.stderr.on("data", (chunk) => {
      this.logs.push(chunk.toString());
    });

    await this.waitFor(
      async () => {
        const response = await fetch(`${this.controlBaseUrl}/health`);
        return response.ok;
      },
      30000,
      "E2E control server",
    );

    await this.waitFor(
      async () => {
        const response = await fetch(`${this.controlBaseUrl}/renderer/snapshot`);
        return response.ok;
      },
      30000,
      "renderer snapshot",
    );
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child) {
      return;
    }

    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 5000);
    });
  }

  async loadFixture(fixtureName: string): Promise<void> {
    const response = await fetch(`${this.controlBaseUrl}/fixture/load`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ fixtureName }),
    });
    const body = (await response.json()) as ControlResponse<never>;
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? `Failed to load fixture ${fixtureName}.`);
    }

    await this.action({
      type: "resetApp",
    });
  }

  async snapshot(): Promise<AppTestSnapshot> {
    const response = await fetch(`${this.controlBaseUrl}/renderer/snapshot`);
    const body = (await response.json()) as ControlResponse<AppTestSnapshot>;
    if (!response.ok || !body.ok || !body.snapshot) {
      throw new Error(body.error ?? "Failed to read app snapshot.");
    }
    return body.snapshot;
  }

  async waitForState(params: AppTestWaitForStateParams): Promise<AppTestSnapshot> {
    const timeoutMs = params.timeoutMs ?? 5000;
    const pollIntervalMs = params.pollIntervalMs ?? 25;
    const startedAt = Date.now();
    let lastSnapshot: AppTestSnapshot | undefined;

    while (Date.now() - startedAt <= timeoutMs) {
      const snapshot = await this.snapshot();
      lastSnapshot = snapshot;
      if (matchesWaitState(snapshot, params)) {
        return snapshot;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      `Timed out waiting for app state after ${timeoutMs}ms: ${JSON.stringify(params)}\nLast snapshot: ${JSON.stringify(lastSnapshot)}\n${this.logs.join("")}`,
    );
  }

  async action(action: AppTestAction): Promise<AppTestSnapshot> {
    const response = await fetch(`${this.controlBaseUrl}/renderer/action`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(action),
    });
    const body = (await response.json()) as ControlResponse<AppTestSnapshot>;
    if (!response.ok || !body.ok || !body.snapshot) {
      throw new Error(`${body.error ?? "Failed to perform app action."}\n${this.logs.join("")}`);
    }
    return body.snapshot;
  }

  private async waitFor(
    predicate: () => Promise<boolean>,
    timeoutMs: number,
    label: string,
  ): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      try {
        if (await predicate()) {
          return;
        }
      } catch {
        // Keep polling until ready.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${label}.\n${this.logs.join("")}`);
  }
}

async function waitForGitPanel(
  harness: E2EAppHarness,
  predicate: (snapshot: AppTestSnapshot) => boolean,
  timeoutMs = 5000,
): Promise<AppTestSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const snapshot = await harness.snapshot();
    if (predicate(snapshot)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for git panel state.");
}

async function waitForSnapshot(
  harness: E2EAppHarness,
  predicate: (snapshot: AppTestSnapshot) => boolean,
  timeoutMs = 5000,
): Promise<AppTestSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const snapshot = await harness.snapshot();
    if (predicate(snapshot)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for snapshot state.");
}

let isBuilt = false;
let harness: E2EAppHarness | undefined;
const isRawBunTest = process.env.OPENACP_BUN_TEST === "1";

beforeAll(async () => {
  if (isRawBunTest) {
    return;
  }
  if (isBuilt) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["run", "build:ui"], {
      cwd: WORKSPACE_ROOT,
      stdio: "inherit",
    });
    child.once("exit", (code) => {
      if (code === 0) {
        isBuilt = true;
        resolve();
        return;
      }
      reject(new Error(`build:ui exited with code ${String(code)}`));
    });
  });
});

afterEach(async () => {
  await harness?.stop();
  harness = undefined;
});

const describeE2E = isRawBunTest ? describe.skip : describe.sequential;

describeE2E("Hybrid Electrobun replay e2e", () => {
  it("boots the real app and exposes a renderer snapshot", async () => {
    harness = new E2EAppHarness();
    await harness.start();
    await harness.loadFixture("chat-basic");

    const snapshot = await harness.snapshot();
    expect(snapshot.ready).toBe(true);
    expect(snapshot.activeSessionId).toBeUndefined();
    expect(snapshot.sessions).toEqual([]);
    expect(snapshot.visibleMessages).toEqual([]);
  });

  it("creates a session and replays a streamed reply", async () => {
    harness = new E2EAppHarness();
    await harness.start();
    await harness.loadFixture("chat-basic");

    await harness.action({
      type: "createSession",
      provider: "codex",
      cwd: "/workspace/project",
    });
    await harness.waitForState({
      activeSessionId: "session-1",
      sessionCount: 1,
    });

    await harness.action({
      type: "typeComposer",
      text: "Summarize the current workspace status.",
    });
    await harness.action({
      type: "submitComposer",
    });

    const snapshot = await harness.waitForState({
      activeSessionId: "session-1",
      visibleMessageCount: 2,
      hasActiveRequest: false,
      lastMessageAuthor: "assistant",
      lastMessageStatus: "complete",
    });

    expect(snapshot.visibleMessages[0]?.author).toBe("user");
    expect(snapshot.visibleMessages[1]?.text).toContain("Workspace looks clean.");
    expect(snapshot.transcriptEntryCount).toBeGreaterThan(0);
    expect(snapshot.runtimeLogCount).toBeGreaterThan(0);
  });

  it("replays approval flows and resumes after a selected option", async () => {
    harness = new E2EAppHarness();
    await harness.start();
    await harness.loadFixture("approval-flow");

    await harness.action({
      type: "createSession",
      provider: "claude",
      cwd: "/workspace/project",
    });
    await harness.waitForState({
      activeSessionId: "session-approval",
      sessionCount: 1,
    });

    await harness.action({
      type: "typeComposer",
      text: "Run the workspace checks.",
    });
    await harness.action({
      type: "submitComposer",
    });

    const approvalSnapshot = await harness.waitForState({
      pendingApprovalCount: 1,
    });
    expect(approvalSnapshot.pendingApprovals[0]?.optionIds).toContain("allow-once");

    await harness.action({
      type: "resolveApproval",
      approvalId: "approval-1",
      optionId: "allow-once",
    });

    const completedSnapshot = await harness.waitForState({
      activeSessionId: "session-approval",
      visibleMessageCount: 2,
      pendingApprovalCount: 0,
      hasActiveRequest: false,
      lastMessageStatus: "complete",
    });
    expect(completedSnapshot.visibleMessages[1]?.text).toContain("Checks passed.");
  });

  it("renders the git sidebar with unified, tokenized diffs and compact headers", async () => {
    harness = new E2EAppHarness();
    await harness.start();
    await harness.loadFixture("approval-flow");

    await harness.action({
      type: "createSession",
      provider: "claude",
      cwd: "/workspace/project",
    });
    await harness.waitForState({
      activeSessionId: "session-approval",
      sessionCount: 1,
    });

    const snapshot = await waitForGitPanel(
      harness,
      (current) =>
        current.rightSidebarOpenTabs.includes("git") &&
        current.gitPanel !== undefined &&
        current.gitPanel.diffViewModes.length > 0 &&
        current.gitPanel.readyHighlightCount > 0 &&
        current.gitPanel.collapsedContextLabels.length > 0,
      15000,
    );

    expect(snapshot.rightSidebarActiveTab).toBe("git");
    expect(snapshot.gitPanel?.diffViewModes).toEqual(["unified"]);
    expect(snapshot.gitPanel?.tokenizedSegmentCount).toBeGreaterThan(0);
    expect(snapshot.gitPanel?.readyHighlightCount).toBeGreaterThan(0);
    expect(snapshot.gitPanel?.collapsedContextLabels[0]).toContain("unchanged lines");
    expect(snapshot.gitPanel?.headerTexts[0]).toContain("src/mainview/App.tsx");
    expect(snapshot.gitPanel?.headerTexts[0]).not.toContain("Unstaged modified");
    expect(snapshot.gitHeaderSummaryText).toContain("+3");
    expect(snapshot.gitHeaderSummaryText).toContain("-2");
  });

  it("replays cancellable flows and completes them after stop", async () => {
    harness = new E2EAppHarness();
    await harness.start();
    await harness.loadFixture("cancel-flow");

    await harness.action({
      type: "createSession",
      provider: "opencode",
      cwd: "/workspace/project",
    });
    await harness.waitForState({
      activeSessionId: "session-cancel",
      sessionCount: 1,
    });

    await harness.action({
      type: "typeComposer",
      text: "Start a long-running scan.",
    });
    await harness.action({
      type: "submitComposer",
    });

    await harness.waitForState({
      activeSessionId: "session-cancel",
      visibleMessageCount: 2,
      hasActiveRequest: true,
    });

    await harness.action({
      type: "cancelActiveRequest",
    });

    const completedSnapshot = await harness.waitForState({
      activeSessionId: "session-cancel",
      visibleMessageCount: 2,
      hasActiveRequest: false,
      lastMessageStatus: "complete",
    });
    expect(completedSnapshot.visibleMessages[1]?.text).toContain("Scanning repo");
  });

  it("switches into plan mode, revises a plan once, then returns to build", async () => {
    harness = new E2EAppHarness();
    await harness.start();
    await harness.loadFixture("plan-review-flow");

    await harness.action({
      type: "createSession",
      provider: "codex",
      cwd: "/workspace/project",
    });
    await harness.waitForState({
      activeSessionId: "session-plan",
      sessionCount: 1,
    });

    const planModeSnapshot = await harness.action({
      type: "setSessionMode",
      mode: "plan",
      sessionId: "session-plan",
    });
    expect(planModeSnapshot.activeSessionMode).toBe("plan");

    await harness.action({
      type: "typeComposer",
      text: "Plan the work for supporting plan/build modes.",
    });
    await harness.action({
      type: "submitComposer",
    });

    const firstReview = await waitForSnapshot(
      harness,
      (snapshot) => snapshot.pendingPlanReview?.reviewId === "plan-review-request-plan-1",
      10000,
    );
    expect(firstReview.pendingPlanReview?.source).toBe("proposed_plan_block");
    expect(firstReview.activeSessionMode).toBe("plan");

    await harness.action({
      type: "respondToPlanReview",
      decision: "revise",
      feedback: "Tighten the ACP fallback story and keep build as the current behavior.",
    });

    const revisedReview = await waitForSnapshot(
      harness,
      (snapshot) => snapshot.pendingPlanReview?.reviewId === "plan-review-request-plan-2",
      10000,
    );
    expect(revisedReview.visibleMessages[3]?.text).toContain("Keep build mapped");
    expect(revisedReview.activeSessionMode).toBe("plan");

    await harness.action({
      type: "respondToPlanReview",
      decision: "start_build",
    });

    const finalSnapshot = await waitForSnapshot(
      harness,
      (snapshot) =>
        snapshot.activeSessionMode === "build" &&
        !snapshot.pendingPlanReview &&
        snapshot.visibleMessages.at(-1)?.text.includes("Implementation started.") === true,
      10000,
    );
    expect(finalSnapshot.visibleMessages).toHaveLength(6);
    expect(finalSnapshot.visibleMessages[4]?.author).toBe("user");
    expect(finalSnapshot.visibleMessages[5]?.text).toContain("Implementation started.");
  });

  it("replays codex approvals, successful tool completion, transcript envelopes, and usage", async () => {
    harness = new E2EAppHarness();
    await harness.start();
    await harness.loadFixture("codex-regressions");

    await harness.action({
      type: "createSession",
      provider: "codex",
      cwd: "/workspace/project",
    });
    await harness.waitForState({
      activeSessionId: "session-codex-regression",
      sessionCount: 1,
    });

    await harness.action({
      type: "typeComposer",
      text: "Create a file called test.txt with hello world",
    });
    await harness.action({
      type: "submitComposer",
    });

    const approvalSnapshot = await harness.waitForState({
      pendingApprovalCount: 1,
    });
    expect(approvalSnapshot.pendingApprovals[0]?.provider).toBe("codex");

    await harness.action({
      type: "resolveApproval",
      approvalId: "approval-codex-1",
      optionId: "allow-once",
    });

    const completedSnapshot = await harness.waitForState({
      activeSessionId: "session-codex-regression",
      visibleMessageCount: 2,
      pendingApprovalCount: 0,
      hasActiveRequest: false,
      lastMessageAuthor: "assistant",
      lastMessageStatus: "complete",
    });

    expect(completedSnapshot.visibleToolCalls[0]).toMatchObject({
      toolCallId: "call_file_change_1",
      kind: "file_change",
      state: "output-available",
    });
    expect(completedSnapshot.visibleToolCalls[0]?.errorText).toBeUndefined();
    expect(completedSnapshot.activeSessionUsage).toMatchObject({
      used: 47809,
      size: 258400,
      inputTokens: 47686,
      outputTokens: 123,
      reasoningTokens: 54,
      cachedInputTokens: 25344,
    });
    expect(completedSnapshot.visibleTranscriptJsons[0]).toContain('"jsonrpc":"2.0"');
  });
});
