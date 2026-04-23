import { create } from "zustand";
import type { AppUpdateEventPayload, AppUpdateState } from "../../shared/AppRPC.ts";

interface AppUpdateStoreState {
  state: AppUpdateState;
  setState: (state: AppUpdateState) => void;
  applyEvent: (payload: AppUpdateEventPayload) => void;
  reset: () => void;
}

function createInitialState(): AppUpdateState {
  return {
    availability: {
      supported: false,
      reason: "unavailable",
    },
    status: "idle",
    statusMessage: "Check for updates",
    canCheck: false,
    canApply: false,
    updateAvailable: false,
    updateReady: false,
  };
}

export const useAppUpdateStore = create<AppUpdateStoreState>((set) => ({
  state: createInitialState(),
  setState: (state) => set({ state }),
  applyEvent: (payload) => set({ state: payload.state }),
  reset: () => set({ state: createInitialState() }),
}));
