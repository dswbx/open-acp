# Workspace Scoped Sessions

## What Was Done

- Added workspace settings types and Bun workspace storage under `~/.open-acp/workspaces/<workspace-id>/settings.json`.
- Moved new transcript paths to `~/.open-acp/workspaces/<workspace-id>/sessions/<encoded-session-id>/`.
- Updated stored session and tool-call gallery readers to scan workspace session roots instead of the legacy flat session root.
- Threaded `workspaceId` through session RPCs, bridge calls, runtime events, stored recordings, and UI session state.
- Keyed provider runtimes by workspace plus provider so matching providers in different workspaces remain isolated.
- Replaced the flat sidebar with a workspace-first nested sidebar and added the new workspace flow.
- Added the Workspaces settings section listing workspace name, root path, and storage paths.
- Added stable session `createdAt` metadata and sorted nested workspace sessions oldest-first by that creation timestamp.
- Adjusted the new workspace dialog copy to use a generic name placeholder and "Default provider" terminology.

## Verification

- `bun run typecheck`
- `bunx vitest run tests/shared/workspaces.test.ts tests/bun/workspaceStore.test.ts tests/bun/rpcHandlers.test.ts tests/bun/providerRuntime.test.ts tests/bun/SessionTranscriptStore.test.ts tests/bun/toolCallGalleryStore.test.ts tests/ui/App.test.tsx tests/ui/SessionListPanel.test.tsx`
- `bun run test`
- Follow-up verification: `bun run typecheck && bun run test`

## ACP Notes

- This change is internal OpenACP app behavior, not an ACP protocol change.
- No new top-level ACP methods were introduced.
- Workspace selection is resolved in app RPC handlers before stable ACP calls such as `session/new`, `session/load`, `session/prompt`, approval responses, mode changes, and transcript writes.
- Provider-private runtime identity is keyed by `{workspaceId, provider}` inside the app runtime manager.
