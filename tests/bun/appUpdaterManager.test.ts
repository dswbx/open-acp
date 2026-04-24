import { describe, expect, it } from "vitest";
import {
  createAppUpdaterManager,
  type ElectrobunUpdaterLike,
} from "../../src/bun/appUpdaterManager.ts";

class FakeUpdater implements ElectrobunUpdaterLike {
  checkCalls = 0;
  downloadCalls = 0;
  applyCalls = 0;
  private statusListener:
    | ((entry: { status: string; message: string; timestamp: number }) => void)
    | null = null;

  constructor(
    private readonly options: {
      channel?: string;
      baseUrl?: string;
      checkResult?: {
        version: string;
        hash: string;
        updateAvailable: boolean;
        updateReady: boolean;
        error: string;
      };
      downloadError?: Error;
      applyError?: Error;
    } = {},
  ) {}

  localInfo = {
    version: async () => "2026.4.1-beta.2",
    hash: async () => "hash-current",
    channel: async () => this.options.channel ?? "canary",
    baseUrl: async () => this.options.baseUrl ?? "https://example.com/updates",
  };

  onStatusChange(
    callback: ((entry: { status: string; message: string; timestamp: number }) => void) | null,
  ): void {
    this.statusListener = callback;
  }

  async checkForUpdate() {
    this.checkCalls += 1;
    return (
      this.options.checkResult ?? {
        version: "2026.4.1-beta.3",
        hash: "hash-next",
        updateAvailable: false,
        updateReady: false,
        error: "",
      }
    );
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
    if (this.options.downloadError) {
      throw this.options.downloadError;
    }
    this.statusListener?.({
      status: "download-progress",
      message: "Downloading update...",
      timestamp: Date.now(),
    });
    this.statusListener?.({
      status: "download-complete",
      message: "Update downloaded",
      timestamp: Date.now(),
    });
  }

  async applyUpdate() {
    this.applyCalls += 1;
    if (this.options.applyError) {
      throw this.options.applyError;
    }
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("appUpdaterManager", () => {
  it("skips the startup check on the dev channel", async () => {
    const updater = new FakeUpdater({
      channel: "dev",
    });
    const manager = createAppUpdaterManager({
      updater,
    });

    await manager.initialize();
    await flushMicrotasks();

    expect(updater.checkCalls).toBe(0);
    expect(updater.downloadCalls).toBe(0);
    expect(manager.getState().availability).toEqual({
      supported: false,
      reason: "dev_channel",
      detail: undefined,
    });
  });

  it("skips the startup check when the release base URL is missing", async () => {
    const updater = new FakeUpdater({
      baseUrl: "",
    });
    const manager = createAppUpdaterManager({
      updater,
    });

    await manager.initialize();
    await flushMicrotasks();

    expect(updater.checkCalls).toBe(0);
    expect(manager.getState().availability).toEqual({
      supported: false,
      reason: "missing_base_url",
      detail: undefined,
    });
  });

  it("downloads an available update during startup and exposes restart state", async () => {
    const updater = new FakeUpdater({
      checkResult: {
        version: "2026.4.1-beta.3",
        hash: "hash-next",
        updateAvailable: true,
        updateReady: false,
        error: "",
      },
    });
    const manager = createAppUpdaterManager({
      updater,
    });
    const statuses: string[] = [];
    manager.subscribe((entry) => {
      statuses.push(entry.status);
    });

    await manager.initialize();
    await flushMicrotasks();

    expect(updater.checkCalls).toBe(1);
    expect(updater.downloadCalls).toBe(1);
    expect(statuses).toContain("available");
    expect(statuses).toContain("downloading");
    expect(manager.getState()).toMatchObject({
      status: "ready_to_restart",
      targetVersion: "2026.4.1-beta.3",
      targetHash: "hash-next",
      canApply: true,
      updateAvailable: true,
      updateReady: true,
    });
  });

  it("applies a downloaded update when the updater reports it is ready", async () => {
    const updater = new FakeUpdater({
      checkResult: {
        version: "2026.4.1-beta.3",
        hash: "hash-next",
        updateAvailable: false,
        updateReady: true,
        error: "",
      },
    });
    const manager = createAppUpdaterManager({
      updater,
    });

    await manager.initialize();
    await flushMicrotasks();
    await manager.applyUpdate();

    expect(manager.getState().status).toBe("ready_to_restart");
    expect(updater.applyCalls).toBe(1);
  });

  it("surfaces updater errors as retryable state", async () => {
    const updater = new FakeUpdater({
      checkResult: {
        version: "",
        hash: "",
        updateAvailable: false,
        updateReady: false,
        error: "Feed unavailable",
      },
    });
    const manager = createAppUpdaterManager({
      updater,
    });

    await manager.initialize();
    await flushMicrotasks();

    expect(manager.getState()).toMatchObject({
      status: "error",
      errorMessage: "Feed unavailable",
      canCheck: true,
      canApply: false,
    });
  });
});
