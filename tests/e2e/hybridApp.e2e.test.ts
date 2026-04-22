import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type {
  AppTestAction,
  AppTestSnapshot,
  AppTestWaitForStateParams,
} from "../../src/shared/e2e.ts";

const WORKSPACE_ROOT = process.cwd();
const CONTROL_PORT = 47831;
const CONTROL_BASE_URL = `http://127.0.0.1:${CONTROL_PORT}`;

interface ControlResponse<T> {
  ok: boolean;
  error?: string;
  snapshot?: T;
  metadata?: unknown;
}

class E2EAppHarness {
  private child?: ChildProcessWithoutNullStreams;
  private readonly logs: string[] = [];

  async start(): Promise<void> {
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
        ACP_E2E_PORT: String(CONTROL_PORT),
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
        const response = await fetch(`${CONTROL_BASE_URL}/health`);
        return response.ok;
      },
      30000,
      "E2E control server",
    );

    await this.waitFor(
      async () => {
        const response = await fetch(`${CONTROL_BASE_URL}/renderer/snapshot`);
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
    const response = await fetch(`${CONTROL_BASE_URL}/fixture/load`, {
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
    const response = await fetch(`${CONTROL_BASE_URL}/renderer/snapshot`);
    const body = (await response.json()) as ControlResponse<AppTestSnapshot>;
    if (!response.ok || !body.ok || !body.snapshot) {
      throw new Error(body.error ?? "Failed to read app snapshot.");
    }
    return body.snapshot;
  }

  async waitForState(params: AppTestWaitForStateParams): Promise<AppTestSnapshot> {
    const response = await fetch(`${CONTROL_BASE_URL}/renderer/wait`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(params),
    });
    const body = (await response.json()) as ControlResponse<AppTestSnapshot>;
    if (!response.ok || !body.ok || !body.snapshot) {
      throw new Error(`${body.error ?? "Failed waiting for app state."}\n${this.logs.join("")}`);
    }
    return body.snapshot;
  }

  async action(action: AppTestAction): Promise<AppTestSnapshot> {
    const response = await fetch(`${CONTROL_BASE_URL}/renderer/action`, {
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

let isBuilt = false;
let harness: E2EAppHarness | undefined;

beforeAll(async () => {
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

describe.sequential("Hybrid Electrobun replay e2e", () => {
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
});
