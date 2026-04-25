# File Change Turn Diffs

## What Changed

- Inspected session `a0639a8a-0db0-4c9f-bd34-dee7c84426ec` and found that its added/deleted files were not emitted as structured `file_change` tool calls.
- Inspected session `d4434ddd-fd60-4587-9eb7-3151a1092ee9` and found that Qwen emits file modifications through `edit` tool calls with `rawOutput.fileDiff`, plus `plan` updates with task entries.
- Added handling for Codex-native `turn/diff/updated` notifications so they surface as synthetic internal `file_change` tool updates.
- Updated file-change presentation to consume full git diff text as well as structured `changes` payloads.
- Updated file-change presentation to consume Qwen `Index: ...` file diffs and active `Edit`/`WriteFile` inputs.
- Preserved Qwen shell-command content when `rawOutput` is empty so clear `rm` commands can still show a deletion label.
- Rehydrated Qwen transcript-only tool/task details during recorded-session restore so existing recordings with lossy normalized events can still render the improved UI.
- Rendered Qwen `plan` entries as compact task-update rows instead of generic thought-process rows.
- Updated expanded file-change diffs to show per-file headers, matching the git panel separation more closely.

## Protocol Notes

- `turn/diff/updated` is Codex-native provider-private transcript data, not stable ACP.
- Qwen `plan` entries and `rawOutput.fileDiff` are provider-specific ACP update shapes, not stable ACP fields.
- No new ACP or OpenACP method was added.
- The adapter translates this provider-private notification into the existing internal provider contract as a `tool_call_update` with `kind: "file_change"` and an output payload `{ type: "turnDiff", diff }`.
- The app UI continues to consume the normalized internal chat stream event shape.

## Decision

Use the full git diff from `turn/diff/updated` as the source of truth when structured `file_change` items are absent. This preserves add/delete/modify information for command-driven edits and lets the existing rich diff renderer show line numbers and file sections.

For Qwen, use `rawOutput.fileDiff` as the source of truth for edits and writes. If a deletion only appears as a shell `rm` command with no diff body, show the deletion label without a reconstructed hunk because the event does not include the deleted file contents.

## Follow-Up: Codex Diagnostics And Approvals

- Inspected session `547ca351-9c08-4bd0-8b86-980ba7cc7e93` and found Codex-native stderr diagnostics for `apply_patch verification failed` arriving while the turn continued streaming.
- The app had been treating every provider stderr line as a fatal chat `error`, which cleared the active request in the UI even though the model kept running.
- Added nonfatal chat error events for provider diagnostics. These are displayed as system diagnostics and do not complete the active assistant turn.
- Normalized ANSI-heavy apply-patch verification failures into a concise message before they reach the UI.
- Improved Codex-native file-change approval requests by reusing the prior `item/started` snapshot for the same `itemId`, so approvals include the actual file-change payload and paths instead of only the permission envelope.
- Compared this with session `8b4dc346-86bc-4db6-a9e6-1a84b239b307`, where Qwen's ACP `session/request_permission` already includes `rawInput`, diff content, and locations.

Protocol note: Codex-native `item/fileChange/requestApproval` only provides the approval envelope and `itemId`; the richer file-change payload is provider-private `item/started` state. The adapter keeps that provider-private lookup inside `CodexNativeClient` and still emits the existing normalized internal approval event.

## Follow-Up: Cancelled Turns With Late Tool Output

- Inspected session `c9722f2b-04b7-4300-8208-fcab7b337162`.
- The slow command was `find .. -name AGENTS.md -print`, which searched outside the repo and into sibling projects and dependency folders. It completed after the user interrupted the turn.
- Codex emitted `turn/completed` with `status: "interrupted"` before the original command's final output and `item/completed` arrived.
- The runtime previously ignored adapter events once `activeRequestId` was cleared, so those late tool updates were dropped and the first command row stayed visually in progress.
- Added a provider-runtime `toolCallId -> requestId` map so late tool updates can still update the correct assistant message after cancellation. Unknown synthetic tool updates still use the active request while a turn is running.
- Added a concise formatter for Codex `write_stdin failed: stdin is closed` diagnostics so the UI does not show the raw router log line.

Protocol note: late `item/commandExecution/outputDelta` and `item/completed` events after `turn/completed` are Codex-native behavior. The app keeps these provider-private ordering details inside the runtime by preserving the request mapping at tool-call start.

## Follow-Up: Duplicate Final Assistant Text

- Inspected session `3ab486d3-be47-42c3-b653-f096b63f5034`.
- Qwen emitted the final answer once as `agent_message_chunk` events; the session transcript stored one assistant message.
- The duplicate was in the mainview render path: on completion the app cached streamed text into `message.text`, while the ordered text block remained in `message.blocks`. `ChatSurface` then rendered both.
- Updated `ChatSurface` so assistant `message.text` is only rendered when no text block is already present. This preserves ordered text/tool/reasoning blocks and still supports plain assistant messages without blocks.
