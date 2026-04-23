import { create } from "zustand";
import type { PlanReviewDecision, PlanReviewEventPayload } from "../../../shared/AppRPC.ts";

type PendingPlanReview = Extract<PlanReviewEventPayload, { kind: "requested" }>;

interface PlanReviewState {
  pendingReview?: PendingPlanReview;
  feedbackDraft: string;
  respondingDecision?: PlanReviewDecision;
  handledRequestIds: string[];
  queuedRevisionBySessionId: Record<string, string | undefined>;
  openReview: (review: PendingPlanReview) => void;
  closeReview: (reviewId?: string) => void;
  setFeedbackDraft: (feedback: string) => void;
  setRespondingDecision: (decision: PlanReviewDecision | undefined) => void;
  queueRevision: (sessionId: string, feedback: string) => void;
  consumeQueuedRevision: (sessionId: string) => string | undefined;
  hasHandledRequest: (requestId?: string) => boolean;
  reset: () => void;
}

function createInitialState() {
  return {
    pendingReview: undefined as PendingPlanReview | undefined,
    feedbackDraft: "",
    respondingDecision: undefined as PlanReviewDecision | undefined,
    handledRequestIds: [] as string[],
    queuedRevisionBySessionId: {} as Record<string, string | undefined>,
  };
}

export const usePlanReviewStore = create<PlanReviewState>((set, get) => ({
  ...createInitialState(),
  openReview: (review) =>
    set((state) => ({
      pendingReview: review,
      feedbackDraft: "",
      respondingDecision: undefined,
      handledRequestIds:
        review.requestId && !state.handledRequestIds.includes(review.requestId)
          ? [...state.handledRequestIds, review.requestId]
          : state.handledRequestIds,
    })),
  closeReview: (reviewId) =>
    set((state) =>
      reviewId && state.pendingReview?.reviewId !== reviewId
        ? state
        : {
            pendingReview: undefined,
            feedbackDraft: "",
            respondingDecision: undefined,
          },
    ),
  setFeedbackDraft: (feedbackDraft) => set({ feedbackDraft }),
  setRespondingDecision: (respondingDecision) => set({ respondingDecision }),
  queueRevision: (sessionId, feedback) =>
    set((state) => ({
      queuedRevisionBySessionId: {
        ...state.queuedRevisionBySessionId,
        [sessionId]: feedback,
      },
    })),
  consumeQueuedRevision: (sessionId) => {
    const feedback = get().queuedRevisionBySessionId[sessionId];
    if (feedback === undefined) {
      return undefined;
    }
    set((state) => {
      const nextQueued = { ...state.queuedRevisionBySessionId };
      delete nextQueued[sessionId];
      return {
        queuedRevisionBySessionId: nextQueued,
      };
    });
    return feedback;
  },
  hasHandledRequest: (requestId) =>
    requestId ? get().handledRequestIds.includes(requestId) : false,
  reset: () => set(createInitialState()),
}));
