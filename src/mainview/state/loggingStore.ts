import { create } from "zustand";
import type { AgentTranscriptEventPayload, SmokeProvider } from "../../shared/AppRPC.ts";

export interface SmokeLogLine {
  id: string;
  level: "info" | "update" | "error";
  message: string;
  provider: SmokeProvider;
  timestamp: string;
}

export interface SessionUsage {
  used: number;
  size: number;
  timestamp: string;
}

const LOG_RETENTION = 150;
const TRANSCRIPT_RETENTION = 200;

interface LoggingState {
  logs: SmokeLogLine[];
  transcriptEntries: AgentTranscriptEventPayload[];
  usageBySessionId: Record<string, SessionUsage>;
  appendLog: (input: Omit<SmokeLogLine, "id">) => void;
  appendTranscriptEntry: (entry: AgentTranscriptEventPayload) => void;
  setSessionUsage: (sessionId: string, usage: SessionUsage) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    logs: [] as SmokeLogLine[],
    transcriptEntries: [] as AgentTranscriptEventPayload[],
    usageBySessionId: {} as Record<string, SessionUsage>,
  };
}

export const useLoggingStore = create<LoggingState>((set) => ({
  ...createInitialState(),
  appendLog: (input) => {
    const entry: SmokeLogLine = { ...input, id: crypto.randomUUID() };
    set((state) => ({
      logs: [...state.logs.slice(-(LOG_RETENTION - 1)), entry],
    }));
  },
  appendTranscriptEntry: (entry) => {
    set((state) => ({
      transcriptEntries: [...state.transcriptEntries.slice(-(TRANSCRIPT_RETENTION - 1)), entry],
    }));
  },
  setSessionUsage: (sessionId, usage) => {
    set((state) => ({
      usageBySessionId: { ...state.usageBySessionId, [sessionId]: usage },
    }));
  },
  reset: () => set(createInitialState()),
}));
