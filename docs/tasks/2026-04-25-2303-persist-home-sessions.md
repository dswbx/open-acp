# Persist Home Sessions

## What Changed

- Moved OpenACP replay/transcript storage from repo-local `.acp/sessions` to `~/.open-acp/sessions`.
- Added stored-session listing from home metadata and exposed it through the typed `listStoredSessions` RPC.
- Added stored-recording fetch over typed RPC so selecting a restored session reloads its saved messages.
- Hydrated the mainview sidebar from stored sessions on startup without selecting a session.
- Restored the saved model into the provider model store and kept it as the fallback when the model catalog is still empty.
- Kept provider resume lazy: restored sessions call provider `session/load` only when selected or used.
- Updated the dev session-recording and tool-call-gallery readers to use `~/.open-acp`.

## Protocol Notes

- Checked `docs/provider-runtime-openacp.md` and the installed ACP schema references for session lifecycle behavior.
- `session/load` remains the stable ACP resume surface used by the provider adapters.
- No new ACP method was introduced. `listStoredSessions` is app-local RPC over the Electrobun bridge.
- `getStoredSessionRecording` is also app-local RPC for replaying locally stored messages.
- Local disk metadata is app-private state, not provider protocol state.

## Decisions

- No migration or fallback read from repo-local `.acp`.
- All valid stored sessions are listed regardless of cwd.
- Startup leaves `activeSessionId` unset.
- Runtime creation can skip eager `session/new` when the next operation is loading an existing session.

## Verification

- `bun run typecheck`
- `bun run test tests/bun/SessionTranscriptStore.test.ts tests/bun/toolCallGalleryStore.test.ts tests/ui/App.test.tsx tests/ui/viteConfig.test.ts`
