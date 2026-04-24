import { create } from "zustand";
import type { NormalizedSessionMode, ProviderSessionModeConfig } from "../../../shared/AppRPC.ts";

interface SessionModeState {
  configsBySessionId: Record<string, ProviderSessionModeConfig>;
  pendingModeBySessionId: Record<string, NormalizedSessionMode | undefined>;
  upsertModeConfig: (config: ProviderSessionModeConfig) => void;
  removeSessionMode: (sessionId: string) => void;
  setPendingMode: (sessionId: string, mode: NormalizedSessionMode | undefined) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    configsBySessionId: {} as Record<string, ProviderSessionModeConfig>,
    pendingModeBySessionId: {} as Record<string, NormalizedSessionMode | undefined>,
  };
}

export const useSessionModeStore = create<SessionModeState>((set) => ({
  ...createInitialState(),
  upsertModeConfig: (config) =>
    set((state) => ({
      configsBySessionId: {
        ...state.configsBySessionId,
        [config.sessionId]: config,
      },
    })),
  removeSessionMode: (sessionId) =>
    set((state) => {
      const nextConfigs = { ...state.configsBySessionId };
      const nextPending = { ...state.pendingModeBySessionId };
      delete nextConfigs[sessionId];
      delete nextPending[sessionId];
      return {
        configsBySessionId: nextConfigs,
        pendingModeBySessionId: nextPending,
      };
    }),
  setPendingMode: (sessionId, mode) =>
    set((state) => ({
      pendingModeBySessionId: {
        ...state.pendingModeBySessionId,
        [sessionId]: mode,
      },
    })),
  reset: () => set(createInitialState()),
}));
