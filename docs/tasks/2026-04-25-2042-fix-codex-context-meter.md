# Fix Codex Context Meter

## What Changed

- Updated Codex native token usage normalization to use `tokenUsage.last` for current context meter values.
- Kept `tokenUsage.total` as a fallback for older or partial Codex usage payloads.
- Added a UI clamp for the context usage percent so provider drift cannot overdraw the progress ring or bar.
- Added regression coverage for cumulative Codex token usage exceeding the model context window.

## Protocol References Checked

- `docs/provider-runtime-openacp.md` lists `thread/tokenUsage/updated` as a Codex-native app-server notification, not a stable ACP method.
- Real local recordings checked:
  - `/Users/dennissenn/Projects/wbx/open-acp/.acp/sessions/1bc06fe9-2c0f-4e09-93fd-cae41b9dbf29/events.jsonl`
  - `/Users/dennissenn/Projects/wbx/open-acp/.acp/sessions/2981f09a-7b68-41a6-b5b8-b0bc5ab2c1b9/events.jsonl`

## Decision

- Treat Codex native `tokenUsage.total` as cumulative session/billing usage.
- Treat Codex native `tokenUsage.last` as the best available current context-window usage proxy.
- Leave ACP provider handling unchanged; this fix is adapter-private to Codex native normalization.

## Verification

- Passed:
  - `bun run test -- tests/bun/codexNativeClient.test.ts tests/ui/contextUsage.test.ts`
  - `bun run typecheck`
  - `bun run test`
