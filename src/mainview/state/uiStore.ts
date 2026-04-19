import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const UI_STORE_KEY = "agent-orchestrator-ui";

export const DEFAULT_LEFT_PANEL_SIZE = 18;
export const DEFAULT_RIGHT_PANEL_SIZE = 22;

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
      storage: createJSONStorage(() => globalThis.localStorage),
      partialize: (state) => ({
        isRightSidebarOpen: state.isRightSidebarOpen,
        leftPanelSize: state.leftPanelSize,
        rightPanelSize: state.rightPanelSize,
      }),
    },
  ),
);
