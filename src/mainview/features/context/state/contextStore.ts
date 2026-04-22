import { create } from "zustand";

export interface SessionContextUsage {
  used: number;
  size: number;
  timestamp: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

interface ContextState {
  usageBySessionId: Record<string, SessionContextUsage>;
  setSessionUsage: (sessionId: string, usage: SessionContextUsage) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    usageBySessionId: {} as Record<string, SessionContextUsage>,
  };
}

export const useContextStore = create<ContextState>((set) => ({
  ...createInitialState(),
  setSessionUsage: (sessionId, usage) => {
    set((state) => ({
      usageBySessionId: { ...state.usageBySessionId, [sessionId]: usage },
    }));
  },
  reset: () => set(createInitialState()),
}));
