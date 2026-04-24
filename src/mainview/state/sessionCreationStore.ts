import { create } from "zustand";
import type { NormalizedSessionMode, SmokeProvider } from "../../shared/AppRPC.ts";

interface SessionCreationState {
  newSessionProvider: SmokeProvider;
  newSessionCwd: string;
  newSessionMode: NormalizedSessionMode;
  isCreatingSession: boolean;
  isChoosingWorkingDirectory: boolean;
  isNewSessionDialogOpen: boolean;
  setNewSessionProvider: (provider: SmokeProvider) => void;
  setNewSessionCwd: (cwd: string) => void;
  setNewSessionMode: (mode: NormalizedSessionMode) => void;
  setIsCreatingSession: (value: boolean) => void;
  setIsChoosingWorkingDirectory: (value: boolean) => void;
  setIsNewSessionDialogOpen: (open: boolean) => void;
  openDialog: (provider: SmokeProvider, cwd: string) => void;
  closeDialog: () => void;
  reset: (newSessionCwd?: string) => void;
}

function createInitialState(newSessionCwd = "") {
  return {
    newSessionProvider: "codex" as SmokeProvider,
    newSessionCwd,
    newSessionMode: "build" as NormalizedSessionMode,
    isCreatingSession: false,
    isChoosingWorkingDirectory: false,
    isNewSessionDialogOpen: false,
  };
}

export const useSessionCreationStore = create<SessionCreationState>((set) => ({
  ...createInitialState(),
  setNewSessionProvider: (newSessionProvider) => set({ newSessionProvider }),
  setNewSessionCwd: (newSessionCwd) => set({ newSessionCwd }),
  setNewSessionMode: (newSessionMode) => set({ newSessionMode }),
  setIsCreatingSession: (isCreatingSession) => set({ isCreatingSession }),
  setIsChoosingWorkingDirectory: (isChoosingWorkingDirectory) =>
    set({ isChoosingWorkingDirectory }),
  setIsNewSessionDialogOpen: (isNewSessionDialogOpen) => set({ isNewSessionDialogOpen }),
  openDialog: (newSessionProvider, newSessionCwd) =>
    set({ newSessionProvider, newSessionCwd, isNewSessionDialogOpen: true }),
  closeDialog: () =>
    set({
      isNewSessionDialogOpen: false,
      isCreatingSession: false,
      isChoosingWorkingDirectory: false,
    }),
  reset: (newSessionCwd) => set(createInitialState(newSessionCwd)),
}));
