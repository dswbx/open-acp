# Tool Call Gallery

## What Was Done

- Added shared tool-call gallery response types.
- Added a `.acp` reader that scans `.acp/sessions/*/events.jsonl`, skips malformed JSON lines with warnings, and merges `tool_call` / `tool_call_update` events by session and tool call id.
- Added a Vite-only `/__open-acp/tool-calls` endpoint for recorded tool calls.
- Added the explicit `?view=tool-calls` mainview route while keeping the normal desktop app shell as the default route.
- Added a tool-call gallery UI that reuses `formatToolPresentation` and `CompactToolCall`.
- Added focused tests for the reader, Vite plugin registration, route selection, gallery model, and static gallery rendering.

## Verification

- `bun run test -- tests/bun/toolCallGalleryStore.test.ts tests/ui/viteConfig.test.ts tests/ui/mainviewRoute.test.ts tests/ui/toolCallGalleryModel.test.ts tests/ui/ToolCallGallery.test.tsx`
  - Passed: 5 files, 11 tests.
- `bun run typecheck`
  - Passed core and UI TypeScript projects.
- `bun run test`
  - Passed: 47 files, 217 tests.
- Manual check with `env OPENACP_DEV_SERVER_PORT=5174 bun run dev:web`
  - `http://localhost:5174/?view=tool-calls` rendered the gallery with real recorded data: 57 merged calls across 40 sessions.
  - The gallery showed filter controls and recorded tool-call rows such as `Read README.md`, `Read SKILL.md`, and `Read package.json`.
  - `http://localhost:5174/` rendered the normal app shell with Sessions, Chat, and Inspector areas, not the gallery route.

## Issues Or Blockers

- Default `5173` was already in use during manual verification, so the web UI was started on port `5174`.
- The browser plugin timed out while capturing a screenshot, so manual verification used DOM snapshots instead.

## Decisions

- Kept the gallery as an explicit query route so packaged desktop loads continue to default to the normal shell.
- Kept filesystem parsing out of `vite.config.ts`; the middleware delegates to `src/bun/toolCallGalleryStore.ts`.
- Reused `CompactToolCall` and `formatToolPresentation` so the gallery exercises the same compact rendering path as chat.
- Treated unknown providers and tool kinds as displayable strings rather than forcing them into the known provider enum.

## Follow-Ups

- Consider adding browser-driven coverage once the gallery layout stabilizes.
- Consider adding a direct “open recorded session” affordance if the gallery becomes part of a broader transcript workbench.
