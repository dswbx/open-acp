# Chat Send Scroll Bottom

## What Was Done

- Added an outbound-submit scroll token in `src/mainview/App.tsx`.
- Wired composer submit, send button submit, app test submit, and inspector retry through helpers that bump the token only when the send or retry can actually proceed.
- Added `forceScrollToBottomToken` to `ChatSurface` and used it to call `scrollToBottom({ animation: "smooth", ignoreEscapes: true })` after initial mount.
- Kept the existing resize-scroll suppression for tool and reasoning expansion unchanged.
- Added focused `ChatSurface` tests for initial render and token-triggered forced scrolling.

## Verification

- `bun run test -- tests/ui/ChatSurface.test.tsx`
- `bun run typecheck`

## Notes

- This was UI-only work in the shipped `src/mainview` surface.
- No ACP protocol behavior, provider adapter behavior, or runtime contract changed.
