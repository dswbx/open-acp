# Inspector Transcript Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ACP transcript the right-sidebar space, remove the live-session transcript cap, and add full-text filtering.

**Architecture:** Keep the inspector UI in `src/ui/components/InspectorPanel.tsx` because `src/mainview/App.tsx` already imports that shared component for the shipped desktop app. Let `src/mainview/App.tsx` own only filtering by active provider/session and remove the separate runtime-events block from the inspector tab. Store every transcript entry appended during the current app session by removing the retention slice in `src/mainview/state/loggingStore.ts`.

**Tech Stack:** React, Zustand, shadcn UI tokens/components, lucide-react icons, Tailwind utility classes.

---

### Task 1: Expandable Inspector Header And Searchable Transcript

**Files:**

- Modify: `src/ui/components/InspectorPanel.tsx`

- [ ] **Step 1: Convert the inspector card to a flex column**

Use `flex min-h-0 flex-1 flex-col` on the root section so its transcript body can fill the sidebar height.

- [ ] **Step 2: Collapse session details behind a button**

Add local state for `isInfoOpen`, keep Stop and Retry visible, and show model/context/status/approval/request details only when expanded.

- [ ] **Step 3: Add transcript search**

Add local state for `transcriptQuery`. Filter entries by lowercased matches across `direction`, `kind`, `method`, `summary`, `requestId`, and `json`.

- [ ] **Step 4: Let transcript results fill remaining height**

Replace `max-h-96` with `min-h-0 flex-1 overflow-auto` and render the filtered list inside that scroll region.

### Task 2: Remove Runtime Events From Inspector Tab

**Files:**

- Modify: `src/mainview/App.tsx`

- [ ] **Step 1: Remove runtime log preparation from the inspector render path**

Delete `newestLogsFirst` from the main render body if it is no longer used there.

- [ ] **Step 2: Remove the Runtime events section**

Leave the inspector tab as a flex container with only `InspectorPanel`, so the transcript receives the freed vertical space.

### Task 3: Remove Transcript Retention Cap

**Files:**

- Modify: `src/mainview/state/loggingStore.ts`

- [ ] **Step 1: Delete the transcript retention constant**

Remove `TRANSCRIPT_RETENTION`.

- [ ] **Step 2: Append entries without slicing**

Change `appendTranscriptEntry` to `transcriptEntries: [...state.transcriptEntries, entry]`.

### Task 4: Verify

**Files:**

- Check: `src/ui/components/InspectorPanel.tsx`
- Check: `src/mainview/App.tsx`
- Check: `src/mainview/state/loggingStore.ts`

- [ ] **Step 1: Run TypeScript validation**

Run: `bun run typecheck`

Expected: command exits successfully.

- [ ] **Step 2: Run main tests**

Run: `bun run test`

Expected: command exits successfully.
