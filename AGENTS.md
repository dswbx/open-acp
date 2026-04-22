# AGENTS.md

## Purpose

This file is the quick orientation guide for agents working in this repo.
Use it before making UI or runtime changes so work lands in the correct surface.

## Source Of Truth

- The shipped desktop app uses `src/mainview`.
- Vite is rooted at `src/mainview` in [vite.config.ts](/Users/dennissenn/Projects/wbx/open-acp/vite.config.ts:13).
- The web entrypoint is [src/mainview/main.tsx](/Users/dennissenn/Projects/wbx/open-acp/src/mainview/main.tsx:1).
- Electrobun loads `views://mainview/index.html` from [src/bun/index.ts](/Users/dennissenn/Projects/wbx/open-acp/src/bun/index.ts:1114).
- `electrobun.config.ts` copies the built Vite output into `views/mainview/*`.

## Directory Roles

- `src/mainview`
  The real application UI for the Electrobun desktop app.
  Put user-visible app behavior here:
  - app shell and layout
  - chat surface and composer
  - titlebar/window-drag behavior
  - theme behavior
  - bridge usage and runtime-connected UI state
  - feature-owned UI that is actively used by the shipped app

- `src/ui`
  Shared UI building blocks and a legacy/internal shell.
  This folder contains reusable panels and primitives that `src/mainview` imports.
  In practice:
  - `src/ui/components/*` is still active and reused by `src/mainview`
  - `src/ui/App.tsx` and `src/ui/main.tsx` are not the shipped desktop app entrypoint
  - if a change is only made in `src/ui/App.tsx`, users likely will not see it in the running app

- `src/bun`
  Electrobun main-process/runtime wiring.
  Put native window setup, RPC wiring, provider runtime orchestration, and app boot behavior here.

- `src/core`
  ACP/client/orchestration logic that should stay UI-agnostic.

- `src/shared`
  Cross-boundary shared types, especially typed RPC contracts.

- `src/mainview/features`
  Feature-oriented home for live desktop app slices such as `git`, `context`, and future additions.
  Prefer adding new user-facing behavior here when it helps keep UI, state, actions, and presentation together.
  We are migrating toward feature-owned structure gradually, not through a large one-time rewrite.

## Working Rules

- For anything visible in the desktop app window, start by checking `src/mainview` first.
- When adding or reshaping a user-facing capability, prefer a `src/mainview/features/<feature>` slice when the change has its own UI, state, or runtime wiring.
- For native window behavior such as title bar, drag regions, or app chrome, check both:
  - `src/bun/index.ts`
  - `src/mainview/App.tsx`
- Strictly use shadcn components and theme color tokens for UI work so the app stays visually consistent everywhere and remains easy to retheme with shadcn themes later.
- Only edit `src/ui/App.tsx` if you intentionally mean to update the internal/legacy shell.
- It is fine to edit `src/ui/components/*` when `src/mainview` imports those shared components.
- Do not migrate existing code into `src/mainview/features` just for consistency; move things gradually as you touch them.
- When unsure which surface is live, verify the entrypoint before changing code.
- Debug transcript storage belongs under the app workspace root, not under per-session working directories.

## Docs Workflow

- Keep planning and execution notes under `docs/`.
- Store approved implementation plans in `docs/plans/`.
- Store task logs in `docs/tasks/`.
- Store durable future work, follow-ups, and important deferred items in `docs/BACKLOG.md`.
- Do not place a plan in `docs/plans/` until the plan has been approved.
- Plans should be named `YYYY-MM-DD-<expressive-plan-name>.md`.
- Tasks should be named `YYYY-MM-DD-<task-name>.md`.
- Prefer one plan file per approved initiative and one task log per concrete task or work session.
- Task logs should capture:
  - what was done
  - what issues or blockers were encountered
  - important decisions, follow-ups, or deviations from the original plan
- If work reveals important but non-urgent follow-up items, add them to `docs/BACKLOG.md` instead of burying them in task notes.
- When creating new plan or task filenames, use lowercase kebab-case after the date.

## Fast Checks

- `bun run start`
  Builds Vite from `src/mainview` and launches Electrobun.

- `bun run dev`
  Best choice for iterating on the actual desktop UI.

- `bun run typecheck`
  Validates both core and UI TypeScript projects.

- `bun run test`
  Runs the main Vitest suite. Use this to verify changes before wrapping up.

- `bun run test:e2e`
  Runs the headless end-to-end replay suite. This is not mandatory for every change, but check it from time to time for app-flow changes, especially around session creation, chat, approvals, or runtime wiring.

Keep this section current whenever verification commands or test coverage expectations change.

## Common Pitfall

There are two React app trees in the repo:

- `src/mainview`: real app
- `src/ui`: internal/legacy shell plus shared components

If a UI fix seems correct in code but does not appear in the running app, confirm it was applied to `src/mainview` rather than only to `src/ui/App.tsx`.
