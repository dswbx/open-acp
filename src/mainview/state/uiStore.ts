import { create } from "zustand";
import type { SmokeBridge } from "../bridge/SmokeBridge.ts";
import {
  DEFAULT_LEFT_PANEL_SIZE,
  DEFAULT_RIGHT_PANEL_SIZE,
  LEFT_PANEL_MIN_WIDTH,
  normalizeUILayoutState,
  RIGHT_PANEL_MIN_WIDTH,
  type PersistedUILayoutState,
} from "../../shared/uiLayoutState.ts";

export const UI_STORE_KEY = "agent-orchestrator-ui";

interface UIState {
  isRightSidebarOpen: boolean;
  leftPanelSize: number;
  rightPanelSize: number;
  setRightSidebarOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
  setPanelSizes: (sizes: { left: number; right: number }) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  isRightSidebarOpen: true,
  leftPanelSize: DEFAULT_LEFT_PANEL_SIZE,
  rightPanelSize: DEFAULT_RIGHT_PANEL_SIZE,
  setRightSidebarOpen: (open) => {
    set({
      isRightSidebarOpen: open,
    });
  },
  toggleRightSidebar: () => {
    set((state) => ({
      isRightSidebarOpen: !state.isRightSidebarOpen,
    }));
  },
  setPanelSizes: ({ left, right }) => {
    set({
      leftPanelSize: Math.max(left, LEFT_PANEL_MIN_WIDTH),
      rightPanelSize: Math.max(right, RIGHT_PANEL_MIN_WIDTH),
    });
  },
}));

function selectPersistedUILayoutState(state: UIState): PersistedUILayoutState {
  return {
    isRightSidebarOpen: state.isRightSidebarOpen,
    leftPanelSize: state.leftPanelSize,
    rightPanelSize: state.rightPanelSize,
  };
}

function readStoredUILayoutFromLocalStorage(): PersistedUILayoutState {
  const rawValue = globalThis.localStorage?.getItem(UI_STORE_KEY);
  if (!rawValue) {
    return normalizeUILayoutState(undefined);
  }

  try {
    const parsed = JSON.parse(rawValue) as { state?: unknown } | unknown;
    if (parsed && typeof parsed === "object" && "state" in parsed) {
      return normalizeUILayoutState((parsed as { state?: unknown }).state);
    }
    return normalizeUILayoutState(parsed);
  } catch {
    return normalizeUILayoutState(undefined);
  }
}

function writeStoredUILayoutToLocalStorage(state: PersistedUILayoutState): void {
  globalThis.localStorage?.setItem(UI_STORE_KEY, JSON.stringify(state));
}

export function hydrateUILayoutState(state: unknown): void {
  useUIStore.setState(normalizeUILayoutState(state));
}

export function hydrateUILayoutStateFromLocalStorage(): void {
  hydrateUILayoutState(readStoredUILayoutFromLocalStorage());
}

export async function hydrateUILayoutStateFromBridge(
  bridge: Pick<SmokeBridge, "getUILayoutState">,
): Promise<void> {
  const result = await bridge.getUILayoutState();
  hydrateUILayoutState(result.state);
}

export function startUILayoutPersistence(
  bridge?: Pick<SmokeBridge, "setUILayoutState">,
): () => void {
  let lastSerializedState = JSON.stringify(selectPersistedUILayoutState(useUIStore.getState()));
  let pendingBridgeState: PersistedUILayoutState | undefined;
  let bridgeWriteInFlight = false;

  const persistPendingBridgeState = async (): Promise<void> => {
    if (!bridge || bridgeWriteInFlight || !pendingBridgeState) {
      return;
    }

    const state = pendingBridgeState;
    pendingBridgeState = undefined;
    bridgeWriteInFlight = true;

    try {
      await bridge.setUILayoutState(state);
    } catch {
      // Renderer localStorage remains the immediate fallback when the native bridge write fails.
    } finally {
      bridgeWriteInFlight = false;
      if (pendingBridgeState) {
        void persistPendingBridgeState();
      }
    }
  };

  return useUIStore.subscribe((state) => {
    const persistedState = selectPersistedUILayoutState(state);
    const serializedState = JSON.stringify(persistedState);
    if (serializedState === lastSerializedState) {
      return;
    }
    lastSerializedState = serializedState;
    writeStoredUILayoutToLocalStorage(persistedState);
    if (bridge) {
      pendingBridgeState = persistedState;
      void persistPendingBridgeState();
    }
  });
}
