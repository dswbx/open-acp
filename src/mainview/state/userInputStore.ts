import { create } from "zustand";
import type { UserInputEventPayload } from "../../shared/AppRPC.ts";

type UserInputRequested = Extract<UserInputEventPayload, { kind: "requested" }>;

interface UserInputState {
  pendingInputs: UserInputRequested[];
  respondingInputId?: string;
  upsertInput: (payload: UserInputRequested) => void;
  removeInput: (inputId: string) => void;
  setRespondingInputId: (inputId: string | undefined) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    pendingInputs: [] as UserInputRequested[],
    respondingInputId: undefined as string | undefined,
  };
}

export const useUserInputStore = create<UserInputState>((set) => ({
  ...createInitialState(),
  upsertInput: (payload) => {
    set((state) => {
      const existingIndex = state.pendingInputs.findIndex(
        (entry) => entry.inputId === payload.inputId,
      );
      if (existingIndex < 0) {
        return { pendingInputs: [...state.pendingInputs, payload] };
      }
      return {
        pendingInputs: state.pendingInputs.map((entry, index) =>
          index === existingIndex ? payload : entry,
        ),
      };
    });
  },
  removeInput: (inputId) => {
    set((state) => ({
      pendingInputs: state.pendingInputs.filter((entry) => entry.inputId !== inputId),
      respondingInputId: state.respondingInputId === inputId ? undefined : state.respondingInputId,
    }));
  },
  setRespondingInputId: (inputId) => {
    set({ respondingInputId: inputId });
  },
  reset: () => set(createInitialState()),
}));
