import { create } from "zustand";
import type { ApprovalEventPayload } from "../../shared/AppRPC.ts";

type ApprovalRequested = Extract<ApprovalEventPayload, { kind: "requested" }>;

interface ApprovalState {
  pendingApprovals: ApprovalRequested[];
  respondingApprovalId?: string;
  upsertApproval: (payload: ApprovalRequested) => void;
  removeApproval: (approvalId: string) => void;
  setRespondingApprovalId: (approvalId: string | undefined) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    pendingApprovals: [] as ApprovalRequested[],
    respondingApprovalId: undefined as string | undefined,
  };
}

export const useApprovalStore = create<ApprovalState>((set) => ({
  ...createInitialState(),
  upsertApproval: (payload) => {
    set((state) => {
      const existingIndex = state.pendingApprovals.findIndex(
        (approval) => approval.approvalId === payload.approvalId,
      );
      if (existingIndex < 0) {
        return { pendingApprovals: [...state.pendingApprovals, payload] };
      }
      return {
        pendingApprovals: state.pendingApprovals.map((approval, index) =>
          index === existingIndex ? payload : approval,
        ),
      };
    });
  },
  removeApproval: (approvalId) => {
    set((state) => ({
      pendingApprovals: state.pendingApprovals.filter(
        (approval) => approval.approvalId !== approvalId,
      ),
      respondingApprovalId:
        state.respondingApprovalId === approvalId ? undefined : state.respondingApprovalId,
    }));
  },
  setRespondingApprovalId: (approvalId) => {
    set({ respondingApprovalId: approvalId });
  },
  reset: () => set(createInitialState()),
}));
