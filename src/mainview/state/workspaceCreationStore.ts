import { create } from "zustand";
import type { NormalizedSessionMode, SmokeProvider } from "../../shared/AppRPC.ts";

interface WorkspaceCreationState {
  isNewWorkspaceDialogOpen: boolean;
  isCreatingWorkspace: boolean;
  isChoosingWorkspaceDirectory: boolean;
  workspaceName: string;
  workspaceRootPath: string;
  workspaceProvider: SmokeProvider;
  workspaceMode: NormalizedSessionMode;
  setIsNewWorkspaceDialogOpen: (open: boolean) => void;
  setIsCreatingWorkspace: (value: boolean) => void;
  setIsChoosingWorkspaceDirectory: (value: boolean) => void;
  setWorkspaceName: (value: string) => void;
  setWorkspaceRootPath: (value: string) => void;
  setWorkspaceProvider: (value: SmokeProvider) => void;
  setWorkspaceMode: (value: NormalizedSessionMode) => void;
  resetDraft: (rootPath?: string) => void;
}

function createInitialState(rootPath = "") {
  return {
    isNewWorkspaceDialogOpen: false,
    isCreatingWorkspace: false,
    isChoosingWorkspaceDirectory: false,
    workspaceName: "",
    workspaceRootPath: rootPath,
    workspaceProvider: "codex" as SmokeProvider,
    workspaceMode: "build" as NormalizedSessionMode,
  };
}

export const useWorkspaceCreationStore = create<WorkspaceCreationState>((set) => ({
  ...createInitialState(),
  setIsNewWorkspaceDialogOpen: (isNewWorkspaceDialogOpen) => set({ isNewWorkspaceDialogOpen }),
  setIsCreatingWorkspace: (isCreatingWorkspace) => set({ isCreatingWorkspace }),
  setIsChoosingWorkspaceDirectory: (isChoosingWorkspaceDirectory) =>
    set({ isChoosingWorkspaceDirectory }),
  setWorkspaceName: (workspaceName) => set({ workspaceName }),
  setWorkspaceRootPath: (workspaceRootPath) => set({ workspaceRootPath }),
  setWorkspaceProvider: (workspaceProvider) => set({ workspaceProvider }),
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
  resetDraft: (rootPath) => set(createInitialState(rootPath)),
}));
