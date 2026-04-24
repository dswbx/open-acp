# Provider Runtime Boundary And OpenACP

## Summary

The shipped desktop app now treats every provider as an adapter behind one internal runtime contract.

- `src/bun/providerRuntime.ts` owns the live provider-runtime manager used by the desktop app.
- `src/bun/providers/providerContract.ts` defines the canonical internal contract.
- `src/bun/providers/ACPProviderAdapter.ts` is the thin ACP passthrough adapter for ACP-speaking providers.
- `src/bun/providers/CodexProviderAdapter.ts` normalizes `codex app-server` into the same contract.
- `src/bun/providers/codexNative/CodexNativeClient.ts` remains the Codex wire client, but only the Codex adapter talks to it.

The Bun runtime and the webview no longer need direct knowledge of raw ACP clients or Codex-native protocol details to drive chat, approvals, model selection, or mode state.

## Current-State Audit

### Methods and notifications the app relies on today

Standard ACP baseline currently used:

- `initialize`
- `session/new`
- `session/load`
- `session/prompt`
- `session/cancel`
- `session/request_permission`
- `session/update`
- `_meta` for attached provider metadata

Preferred but transitional ACP surfaces now understood by the runtime:

- `configOptions`
- `session/set_config_option`
- `config_option_update`
- legacy `modes`
- `session/set_mode`
- optional session capabilities like `list`, `resume`, and `close`

OpenACP-specific surface used by the runtime in this slice:

- `_openacp/session/request_user_input`
- `_openacp/session/user_input_resolved`
- `_openacp/capabilities` metadata for extension advertisement

Provider-specific Codex protocol surfaces normalized by the Codex adapter:

- `thread/start`
- `thread/resume`
- `turn/start`
- `turn/interrupt`
- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `item/tool/requestUserInput`
- `item/agentMessage/delta`
- `item/reasoning/*`
- `item/plan/delta`
- `item/started`
- `item/completed`
- `thread/tokenUsage/updated`
- `turn/completed`

### Current assumptions the repo still makes

Models and model metadata:

- Provider model catalogs are still runtime-owned and provider-scoped.
- The runtime still prefers advertised session models and falls back to model `configOptions`.
- Provider-specific model encodings still exist where needed, such as Codex model/reasoning-effort ids and Claude thinking-level overlays.

Modes and config:

- `configOptions` is now the canonical internal configuration surface.
- Mode is normalized from `configOptions` first, then legacy `modes`, then provider metadata like `currentModeId`.
- Codex now advertises mode as a config option rather than only as hidden metadata.

Approvals:

- Approval UX remains app-visible and provider-agnostic at the webview boundary.
- Providers resolve approvals through adapter methods, not direct protocol calls from the app runtime.

Questions:

- General user-question flow is treated as OpenACP, not stable ACP.
- The runtime can now surface user-input requests to the webview through a normalized event and response RPC pair.

Transcript events:

- Raw protocol transcript logging still exists for debugging and replay analysis.
- Protocol logs remain in the Bun runtime and are emitted as transcript events; app logic does not depend on raw wire messages.

Replay metadata:

- Replay metadata still records `transport`, `providerSessionId`, and `currentModeId`.
- Those fields are now sourced from normalized session handles and adapter-managed replay metadata.

Capabilities:

- Capabilities are normalized into a provider-agnostic shape before the runtime uses them.
- OpenACP extension support is advertised explicitly through `_openacp/capabilities`.

Plan mode and plan presentation:

- Plan mode is normalized through session config/mode state, not provider-specific UI branching.
- Codex `item/plan/delta` is normalized into the shared contract as `plan_update`.
- The current webview still renders plan text through the reasoning stream in this slice; the normalized runtime event is the source of truth for future provider-agnostic plan rendering.

## Canonical Internal Contract

The internal provider contract lives in `src/bun/providers/providerContract.ts`.

Primary types:

- `ProviderAdapter`
- `ProviderSessionHandle`
- `ProviderCapabilities`
- `ProviderConfigState`
- `ProviderModeState`
- `ProviderApprovalRequest`
- `ProviderUserInputRequest`
- `ProviderPlanUpdate`
- `ProviderUsageUpdate`
- `ProviderReplayMetadata`
- `ProviderEvent`

Required adapter operations:

- `initialize`
- `createSession`
- `loadSession`
- `sendPrompt`
- `cancelTurn`
- `setConfigOption`
- `setMode`
- `respondToApproval`
- `respondToUserInput`
- `subscribe`

Normalized runtime event families:

- assistant message chunks
- thought chunks
- plan updates
- tool lifecycle updates
- usage updates
- available command updates
- config and mode updates
- approval requests
- user-input requests

Provider-private data stays attached under `_meta` and inside adapter-local implementation details.

## Mapping Matrix

### ACP stable

- `initialize` -> adapter capability discovery
- `session/new` / `session/load` -> `ProviderSessionHandle`
- `session/prompt` -> `sendPrompt`
- `session/cancel` -> `cancelTurn`
- `session/request_permission` -> `ProviderApprovalRequest`
- `session/update` message, thought, tool, usage, and available-command updates -> normalized `ProviderEvent`
- `_meta` -> replay metadata and provider-private attached data

### ACP transitional or draft-preferred

- `configOptions` -> normalized `ProviderConfigState.options`
- `session/set_config_option` -> preferred config mutation path
- `config_option_update` -> normalized config sync event
- legacy `modes` / `session/set_mode` -> compatibility fallback for mode control

### OpenACP

- `_openacp/session/request_user_input` -> normalized `ProviderUserInputRequest`
- `_openacp/session/user_input_resolved` -> normalized user-input resolution flow
- `_openacp/capabilities` -> explicit extension capability advertisement

### Provider-private

- Codex thread ids, turn ids, approval decision payloads, and request/response shapes remain private to `CodexProviderAdapter` and `CodexNativeClient`.
- ACP transport details remain private to `ACPProviderAdapter` and `ACPClient`.

## Adapter Authoring Guide

### Add a new provider adapter

1. Implement `ProviderAdapter`.
2. Normalize session setup into `ProviderSessionHandle`.
3. Normalize provider updates into `ProviderEvent`.
4. Keep provider-only metadata in `_meta` or adapter-local state.
5. Expose questions only through OpenACP namespaced methods or equivalent adapter-local translation.

### Decide ACP vs OpenACP vs provider-private

Use standard ACP when:

- the behavior exists in stable ACP and maps cleanly

Use transitional ACP when:

- ACP already has a documented direction we expect to matter soon, such as `configOptions`

Use OpenACP when:

- the app needs the behavior and ACP does not define a portable stable equivalent
- the behavior can be expressed cleanly through `_meta` or `_openacp/...` namespaced requests/notifications

Keep behavior provider-private when:

- it is pure protocol translation detail with no reason to leak above the adapter

### How Codex is normalized

- session lifecycle is translated from `thread/*`
- prompts and interrupts are translated from `turn/start` and `turn/interrupt`
- approvals are translated from Codex approval requests into normalized approval requests
- user questions are translated from `item/tool/requestUserInput` into the OpenACP user-input flow
- plan deltas are translated into normalized `plan_update` events
- Codex model and reasoning-effort config stays provider-specific in representation, but it is surfaced as normalized config options
- Codex collaboration mode is carried as normalized mode state with the raw mode id retained for replay and adapter-local translation
