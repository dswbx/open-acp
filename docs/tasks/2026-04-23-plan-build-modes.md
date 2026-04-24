## Summary

Implemented normalized `build | plan` session modes across the ACP-first runtime and mainview UI, with dedicated plan review handling and compatibility fallbacks for Claude, Qwen, and Codex.

Also tightened the replay/e2e harness so headless Electrobun tests can run against a caller-selected Vite dev-server port and a per-run ephemeral E2E control port.

## What Changed

- Added ACP session mode/config support to the core types and client plumbing.
- Added normalized app/session RPC types for:
  - current normalized mode
  - provider-advertised mode/config capabilities
  - mode sync source
  - plan review requests and responses
- Implemented runtime normalization that prefers ACP `configOptions` over ACP `modes`, with adapter-private/provider-private fallback where needed.
- Added mainview mode state, selector UI, and plan review UI.
- Defaulted new/existing sessions to `build`, which preserves the app's shipped execution behavior.
- Added plan-review handling for:
  - native/provider-driven plan completion
  - `<proposed_plan>` parsing fallback
  - full-assistant-message fallback
- Preserved one visible thread/session experience while allowing provider session/config remapping behind the scenes.
- Fixed assistant completion text derivation so streamed text blocks are copied into the finalized assistant message text.
- Hardened the replay/e2e harness:
  - Vite dev-server port can be supplied via `OPENACP_DEV_SERVER_PORT`
  - E2E control server now uses an ephemeral per-run port in the Vitest harness
  - replay cancellation now queues slightly-early cancel requests instead of racing and getting dropped
  - renderer wait logic in e2e tests now polls snapshots directly for stability

## ACP Notes

- Treated ACP `configOptions`, `session/set_config_option`, and `config_option_update` as the preferred stable direction for session configuration.
- Treated ACP `modes`, `session/set_mode`, and related mode switching surfaces as transitional compatibility only.
- Kept general structured user-input/question behavior out of the cross-provider normalized surface for v1.
- Kept Codex-specific question/mode gating adapter-private instead of introducing new unnamespaced protocol methods.
- Observed live Codex ACP drift on April 23, 2026:
  - the session `mode` config option and advertised `modes` currently expose approval presets (`read-only`, `auto`, `full-access`), not collaboration `build | plan`
  - Codex ACP also rejects `session/set_mode { modeId: "plan" }` with `Invalid params` in this environment
  - the normalized session-mode resolver now maps that Codex approval-preset surface as:
    - `read-only -> plan`
    - `auto -> build`
  - Codex plan behavior is therefore a hybrid:
    - ACP config option switching enforces read-only execution constraints
    - OpenACP prompt steering asks the agent to return a `<proposed_plan>` block and wait for review

## References Checked

- Repo guidance in `AGENTS.md`
- `docs/provider-runtime-openacp.md`
- `docs/tasks/2026-04-22-acp-question-compatibility-findings.md`
- Approved implementation plan and linked ACP/provider references used for this slice:
  - ACP Session Config Options
  - ACP Session Modes
  - ACP Elicitation RFD
  - Claude permission mode references
  - Qwen approval mode references
  - Codex collaboration mode references

## Protocol Classification

- Stable ACP:
  - `initialize`
  - `session/new`
  - `session/load`
  - `session/prompt`
  - `session/cancel`
  - `session/request_permission`
  - `_meta`
  - `configOptions`
  - `session/set_config_option`
  - `config_option_update`
- Transitional ACP:
  - `modes`
  - `session/set_mode`
  - live current-mode sync when only exposed through ACP modes
- OpenACP / provider-private:
  - generalized user question flows
  - Codex-specific question gating
  - provider-native plan completion / switch-mode bridging

## Verification

- `bun run typecheck`
- `bun run test -- tests/acp/ACPClient.test.ts tests/bun/sessionModes.test.ts tests/ui/App.test.tsx`
- `OPENACP_DEV_SERVER_PORT=53247 bun run test:e2e`

## Notes / Follow-Up

- The e2e harness originally failed under sandboxed execution because the desktop app launch path needs unrestricted execution; headless Electrobun e2e should continue to be run outside the sandbox.
- The Vite build still emits large-chunk warnings during e2e runs; these are pre-existing build warnings, not test failures.
