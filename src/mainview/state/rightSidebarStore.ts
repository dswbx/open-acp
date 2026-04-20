import { create } from "zustand";
import type { AvailableCommand } from "../../shared/AppRPC.ts";
import type { RightSidebarTabType } from "../components/RightSidebarTabs.tsx";

interface RightSidebarState {
  openTabs: RightSidebarTabType[];
  activeTab: RightSidebarTabType;
  availableCommandsBySession: Record<string, AvailableCommand[]>;
  openTab: (tab: RightSidebarTabType) => void;
  closeTab: (tab: RightSidebarTabType) => void;
  setActiveTab: (tab: RightSidebarTabType) => void;
  setAvailableCommands: (sessionId: string, commands: AvailableCommand[]) => void;
  setAvailableCommandsIfAbsent: (sessionId: string, commands: AvailableCommand[]) => void;
  reset: () => void;
}

const createInitialState = () => ({
  openTabs: ["inspector"] as RightSidebarTabType[],
  activeTab: "inspector" as RightSidebarTabType,
  availableCommandsBySession: {} as Record<string, AvailableCommand[]>,
});

export const useRightSidebarStore = create<RightSidebarState>((set) => ({
  ...createInitialState(),
  openTab: (tab) =>
    set((state) => ({
      openTabs: state.openTabs.includes(tab) ? state.openTabs : [...state.openTabs, tab],
      activeTab: tab,
    })),
  closeTab: (tab) =>
    set((state) => {
      if (!state.openTabs.includes(tab)) {
        return state;
      }
      const remaining = state.openTabs.filter((candidate) => candidate !== tab);
      return {
        openTabs: remaining,
        activeTab:
          state.activeTab === tab ? (remaining[remaining.length - 1] ?? "inspector") : state.activeTab,
      };
    }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setAvailableCommands: (sessionId, commands) =>
    set((state) => ({
      availableCommandsBySession: {
        ...state.availableCommandsBySession,
        [sessionId]: commands,
      },
    })),
  setAvailableCommandsIfAbsent: (sessionId, commands) =>
    set((state) => {
      if (state.availableCommandsBySession[sessionId] !== undefined) {
        return state;
      }
      return {
        availableCommandsBySession: {
          ...state.availableCommandsBySession,
          [sessionId]: commands,
        },
      };
    }),
  reset: () => set(createInitialState()),
}));
