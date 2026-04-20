import { create } from "zustand";
import type { GetGitStatusResult } from "../../shared/AppRPC.ts";

interface GitState {
  statusByCwd: Record<string, GetGitStatusResult | undefined>;
  errorsByCwd: Record<string, string | undefined>;
  loadingByCwd: Record<string, boolean | undefined>;
  beginLoad: (cwd: string) => void;
  completeLoad: (cwd: string, status: GetGitStatusResult) => void;
  failLoad: (cwd: string, message: string) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    statusByCwd: {} as Record<string, GetGitStatusResult | undefined>,
    errorsByCwd: {} as Record<string, string | undefined>,
    loadingByCwd: {} as Record<string, boolean | undefined>,
  };
}

export const useGitStore = create<GitState>((set) => ({
  ...createInitialState(),
  beginLoad: (cwd) => {
    set((state) => ({
      loadingByCwd: { ...state.loadingByCwd, [cwd]: true },
      errorsByCwd: { ...state.errorsByCwd, [cwd]: undefined },
    }));
  },
  completeLoad: (cwd, status) => {
    set((state) => ({
      statusByCwd: { ...state.statusByCwd, [cwd]: status },
      loadingByCwd: { ...state.loadingByCwd, [cwd]: false },
    }));
  },
  failLoad: (cwd, message) => {
    set((state) => ({
      loadingByCwd: { ...state.loadingByCwd, [cwd]: false },
      errorsByCwd: { ...state.errorsByCwd, [cwd]: message },
    }));
  },
  reset: () => set(createInitialState()),
}));
