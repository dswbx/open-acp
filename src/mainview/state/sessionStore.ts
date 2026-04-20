import { create } from "zustand";
import type { SmokeProvider } from "../../shared/AppRPC.ts";
import type { SessionListItem } from "../../ui/components/SessionListPanel.tsx";

export interface ChatSession extends SessionListItem {
  provider: SmokeProvider;
}

interface SessionState {
  sessions: ChatSession[];
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  draftProvider: SmokeProvider;
  isDraftingSession: boolean;
  setSessions: (updater: (prev: ChatSession[]) => ChatSession[]) => void;
  setActiveSessionId: (id: string | undefined) => void;
  setSelectedProvider: (provider: SmokeProvider) => void;
  setDraftProvider: (provider: SmokeProvider) => void;
  setIsDraftingSession: (value: boolean) => void;
  applySessionTransition: (patch: {
    sessions?: (prev: ChatSession[]) => ChatSession[];
    activeSessionId?: string;
    selectedProvider?: SmokeProvider;
    draftProvider?: SmokeProvider;
    isDraftingSession?: boolean;
  }) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: undefined,
  selectedProvider: "codex",
  draftProvider: "codex",
  isDraftingSession: false,
  setSessions: (updater) => set((state) => ({ sessions: updater(state.sessions) })),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setSelectedProvider: (selectedProvider) => set({ selectedProvider }),
  setDraftProvider: (draftProvider) => set({ draftProvider }),
  setIsDraftingSession: (isDraftingSession) => set({ isDraftingSession }),
  applySessionTransition: (patch) =>
    set((state) => ({
      sessions: patch.sessions ? patch.sessions(state.sessions) : state.sessions,
      activeSessionId: patch.activeSessionId ?? state.activeSessionId,
      selectedProvider: patch.selectedProvider ?? state.selectedProvider,
      draftProvider: patch.draftProvider ?? state.draftProvider,
      isDraftingSession: patch.isDraftingSession ?? state.isDraftingSession,
    })),
}));
