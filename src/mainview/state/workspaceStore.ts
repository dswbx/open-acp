import { create } from "zustand";
import type { WorkspaceSummary } from "../../shared/workspaces.ts";

interface WorkspaceState {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId?: string;
  setWorkspaces: (workspaces: WorkspaceSummary[]) => void;
  upsertWorkspace: (workspace: WorkspaceSummary) => void;
  setActiveWorkspaceId: (workspaceId: string | undefined) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    workspaces: [] as WorkspaceSummary[],
    activeWorkspaceId: undefined as string | undefined,
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...createInitialState(),
  setWorkspaces: (workspaces) =>
    set((state) => ({
      workspaces,
      activeWorkspaceId:
        state.activeWorkspaceId &&
        workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
          ? state.activeWorkspaceId
          : workspaces[0]?.id,
    })),
  upsertWorkspace: (workspace) =>
    set((state) => {
      const next = [
        workspace,
        ...state.workspaces.filter((existing) => existing.id !== workspace.id),
      ];
      return {
        workspaces: next,
        activeWorkspaceId: workspace.id,
      };
    }),
  setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),
  reset: () => set(createInitialState()),
}));
