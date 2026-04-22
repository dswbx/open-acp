import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const UI_STORE_KEY = "agent-orchestrator-ui";

export const DEFAULT_LEFT_PANEL_SIZE = 280;
export const DEFAULT_RIGHT_PANEL_SIZE = 320;

const LEFT_PANEL_MIN_WIDTH = 250;
const RIGHT_PANEL_MIN_WIDTH = 300;

interface UIState {
  isRightSidebarOpen: boolean;
  leftPanelSize: number;
  rightPanelSize: number;
  setRightSidebarOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
  setPanelSizes: (sizes: { left: number; right: number }) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
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
          leftPanelSize: left,
          rightPanelSize: right,
        });
      },
    }),
    {
      name: UI_STORE_KEY,
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<UIState> | undefined;

        return {
          ...state,
          leftPanelSize:
            typeof state?.leftPanelSize === "number"
              ? state.leftPanelSize < 100
                ? LEFT_PANEL_MIN_WIDTH
                : Math.max(state.leftPanelSize, LEFT_PANEL_MIN_WIDTH)
              : DEFAULT_LEFT_PANEL_SIZE,
          rightPanelSize:
            typeof state?.rightPanelSize === "number"
              ? state.rightPanelSize < 100
                ? RIGHT_PANEL_MIN_WIDTH
                : Math.max(state.rightPanelSize, RIGHT_PANEL_MIN_WIDTH)
              : DEFAULT_RIGHT_PANEL_SIZE,
        } satisfies Partial<UIState>;
      },
      storage: createJSONStorage(() => globalThis.localStorage),
      partialize: (state) => ({
        isRightSidebarOpen: state.isRightSidebarOpen,
        leftPanelSize: state.leftPanelSize,
        rightPanelSize: state.rightPanelSize,
      }),
    },
  ),
);
