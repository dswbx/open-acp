import { create } from "zustand";
import type { ChatMessage } from "../chat/types.ts";

interface ChatData {
  chatMessages: ChatMessage[];
  chatInput: string;
  isSending: boolean;
  isCancellingRequest: boolean;
  activeRequestId?: string;
}

interface ChatState extends ChatData {
  setChatInput: (value: string) => void;
  setIsSending: (value: boolean) => void;
  setIsCancellingRequest: (value: boolean) => void;
  setActiveRequestId: (value: string | undefined) => void;
  setChatMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateChat: (updater: Partial<ChatData> | ((state: ChatData) => Partial<ChatData>)) => void;
  reset: () => void;
}

function createInitialState(): ChatData {
  return {
    chatMessages: [],
    chatInput: "",
    isSending: false,
    isCancellingRequest: false,
    activeRequestId: undefined,
  };
}

export const useChatStore = create<ChatState>((set) => ({
  ...createInitialState(),
  setChatInput: (value) => set({ chatInput: value }),
  setIsSending: (value) => set({ isSending: value }),
  setIsCancellingRequest: (value) => set({ isCancellingRequest: value }),
  setActiveRequestId: (value) => set({ activeRequestId: value }),
  setChatMessages: (updater) => set((state) => ({ chatMessages: updater(state.chatMessages) })),
  updateChat: (updater) => {
    if (typeof updater === "function") {
      set((state) => updater(state));
    } else {
      set(updater);
    }
  },
  reset: () => set(createInitialState()),
}));
