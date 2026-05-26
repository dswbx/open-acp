# OpenCode Inline Diffs

## What Changed

- Inspected OpenCode session `ses_19cff9481ffesGEuhb96zpVykI`.
- Found that completed `edit` tool calls include usable diff data in `rawOutput.metadata.filediff`, `rawOutput.metadata.diff`, and ACP `content` entries with `type: "diff"`.
- Updated file-change presentation so OpenCode edit results render through the existing inline git diff UI instead of falling back to raw tool JSON.
- Added a strict provider parity unit suite covering Codex-native, standard ACP, Qwen ACP, and OpenCode ACP normalized behaviors for messages, thoughts, tools, file edit presentation, usage, and plan deltas.

## Protocol Notes

- OpenCode `rawOutput.metadata.filediff`, `rawOutput.metadata.diff`, and `content[type="diff"]` are provider-specific ACP payload shapes, not stable ACP fields.
- The app keeps those shapes out of the shared runtime contract and normalizes them at the existing chat file-change presentation boundary.
- Qwen `rawOutput.fileDiff` and Codex-native turn/file-change diff payloads remain provider-private source shapes.
- No new ACP or OpenACP method was added.

## Decision

Provider parity is enforced at the normalized app contract, not by requiring raw provider wire payloads to match. Provider-specific diff sources are allowed, but shipped provider dialects must produce equivalent user-visible file-change presentation for the common edit scenario.
