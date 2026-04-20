import { create } from "zustand";
import type { SmokeProvider } from "../../shared/AppRPC.ts";

interface SessionCreationState {
  newSessionProvider: SmokeProvider;
  newSessionCwd: string;
  isCreatingSession: boolean;
  isChoosingWorkingDirectory: boolean;
  isNewSessionDialogOpen: boolean;
  setNewSessionProvider: (provider: SmokeProvider) => void;
  setNewSessionCwd: (cwd: string) => void;
  setIsCreatingSession: (value: boolean) => void;
  setIsChoosingWorkingDirectory: (value: boolean) => void;
  setIsNewSessionDialogOpen: (open: boolean) => void;
  openDialog: (provider: SmokeProvider, cwd: string) => void;
  closeDialog: () => void;
}

export const useSessionCreationStore = create<SessionCreationState>((set) => ({
  newSessionProvider: "codex",
  newSessionCwd: "",
  isCreatingSession: false,
  isChoosingWorkingDirectory: false,
  isNewSessionDialogOpen: false,
  setNewSessionProvider: (newSessionProvider) => set({ newSessionProvider }),
  setNewSessionCwd: (newSessionCwd) => set({ newSessionCwd }),
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
}));
