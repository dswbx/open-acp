import { create } from "zustand";
import type { SessionDirectoryEntry } from "../../shared/AppRPC.ts";

interface DirectoryState {
  homeDirectory?: string;
  entriesByCwd: Record<string, SessionDirectoryEntry[]>;
  errorsByCwd: Record<string, string | undefined>;
  loadingByCwd: Record<string, boolean | undefined>;
  setHomeDirectory: (path: string) => void;
  beginLoad: (cwd: string) => void;
  completeLoad: (cwd: string, entries: SessionDirectoryEntry[]) => void;
  failLoad: (cwd: string, message: string) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    homeDirectory: undefined as string | undefined,
    entriesByCwd: {} as Record<string, SessionDirectoryEntry[]>,
    errorsByCwd: {} as Record<string, string | undefined>,
    loadingByCwd: {} as Record<string, boolean | undefined>,
  };
}

export const useDirectoryStore = create<DirectoryState>((set) => ({
  ...createInitialState(),
  setHomeDirectory: (path) => {
    set({ homeDirectory: path });
  },
  beginLoad: (cwd) => {
    set((state) => ({
      loadingByCwd: { ...state.loadingByCwd, [cwd]: true },
      errorsByCwd: { ...state.errorsByCwd, [cwd]: undefined },
    }));
  },
  completeLoad: (cwd, entries) => {
    set((state) => ({
      entriesByCwd: { ...state.entriesByCwd, [cwd]: entries },
      loadingByCwd: { ...state.loadingByCwd, [cwd]: false },
    }));
  },
  failLoad: (cwd, message) => {
    set((state) => ({
      loadingByCwd: { ...state.loadingByCwd, [cwd]: false },
      errorsByCwd: { ...state.errorsByCwd, [cwd]: message },
    }));
  },
  reset: () =>
    set((state) => ({
      ...createInitialState(),
      homeDirectory: state.homeDirectory,
    })),
}));
