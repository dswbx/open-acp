import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const UI_STORE_KEY = "agent-orchestrator-ui";

interface UIState {
  isRightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isRightSidebarOpen: true,
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
    }),
    {
      name: UI_STORE_KEY,
      storage: createJSONStorage(() => globalThis.localStorage),
      partialize: (state) => ({
        isRightSidebarOpen: state.isRightSidebarOpen,
      }),
    },
  ),
);
