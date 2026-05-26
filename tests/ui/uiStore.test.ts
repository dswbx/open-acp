import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startUILayoutPersistence, useUIStore } from "../../src/mainview/state/uiStore.ts";
import type { SetUILayoutStateResult } from "../../src/shared/AppRPC.ts";
import {
  DEFAULT_LEFT_PANEL_SIZE,
  DEFAULT_RIGHT_PANEL_SIZE,
  type PersistedUILayoutState,
} from "../../src/shared/uiLayoutState.ts";

class DeferredUILayoutBridge {
  readonly calls: PersistedUILayoutState[] = [];
  private readonly resolvers: Array<() => void> = [];

  async setUILayoutState(state: PersistedUILayoutState): Promise<SetUILayoutStateResult> {
    this.calls.push(state);
    await new Promise<void>((resolve) => {
      this.resolvers.push(resolve);
    });
    return { state };
  }

  resolveNextWrite(): void {
    const resolve = this.resolvers.shift();
    if (!resolve) {
      throw new Error("No pending layout write to resolve.");
    }
    resolve();
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("uiStore", () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    useUIStore.setState({
      isRightSidebarOpen: true,
      leftPanelSize: DEFAULT_LEFT_PANEL_SIZE,
      rightPanelSize: DEFAULT_RIGHT_PANEL_SIZE,
    });
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
  });

  it("coalesces bridge layout writes so the latest sidebar size wins", async () => {
    const bridge = new DeferredUILayoutBridge();
    unsubscribe = startUILayoutPersistence(bridge);

    useUIStore.getState().setPanelSizes({ left: 320, right: 340 });
    useUIStore.getState().setPanelSizes({ left: 360, right: 380 });
    useUIStore.getState().setPanelSizes({ left: 400, right: 420 });

    expect(bridge.calls).toEqual([
      {
        isRightSidebarOpen: true,
        leftPanelSize: 320,
        rightPanelSize: 340,
      },
    ]);

    bridge.resolveNextWrite();
    await flushMicrotasks();

    expect(bridge.calls).toEqual([
      {
        isRightSidebarOpen: true,
        leftPanelSize: 320,
        rightPanelSize: 340,
      },
      {
        isRightSidebarOpen: true,
        leftPanelSize: 400,
        rightPanelSize: 420,
      },
    ]);
  });
});
