import { create } from "zustand";
import type { AgentTranscriptEventPayload, SmokeProvider } from "../../shared/AppRPC.ts";

export interface SmokeLogLine {
  id: string;
  level: "info" | "update" | "error";
  message: string;
  provider: SmokeProvider;
  timestamp: string;
}

const LOG_RETENTION = 150;

interface LoggingState {
  logs: SmokeLogLine[];
  transcriptEntries: AgentTranscriptEventPayload[];
  appendLog: (input: Omit<SmokeLogLine, "id">) => void;
  appendTranscriptEntry: (entry: AgentTranscriptEventPayload) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    logs: [] as SmokeLogLine[],
    transcriptEntries: [] as AgentTranscriptEventPayload[],
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
      transcriptEntries: [...state.transcriptEntries, entry],
    }));
  },
  reset: () => set(createInitialState()),
}));
