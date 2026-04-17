# Provider Model Discovery Design

## Problem

The app currently treats provider model discovery as `initialize._meta.models` metadata. In practice, Claude ACP, Codex ACP, and OpenCode do not advertise their model catalogs there, so the UI often shows only **Default model** even when the provider supports explicit model selection.

The implementation also carries stale ACP assumptions:

- `session/new` is typed as returning only `{ sessionId }`
- `session/load` is typed as returning no useful session metadata
- model selection support is inferred from `sessionCapabilities.setModel`

Those assumptions no longer match the installed ACP SDK schema or real provider behavior.

## Goals

- Make provider model discovery accurate for Claude, Codex, and OpenCode using ACP only.
- Discover models from the protocol surfaces providers actually populate today.
- Keep the model picker accurate before the first chat prompt whenever practical.
- Preserve the current ability to send chat with no explicit model selected.
- Avoid provider-specific scraping, CLI parsing, or non-ACP fallbacks in this slice.

## Non-Goals

- Adding provider-specific model discovery outside ACP.
- Adding background refresh or manual refresh controls.
- Persisting discovered model catalogs across app restarts.
- Reworking the broader session architecture beyond what is needed for accurate ACP discovery.

## Current State

- `src/bun/index.ts` records provider model catalogs from `initializeResult._meta?.models`.
- `src/core/adapters/*Adapter.ts` normalize only `result._meta?.models`.
- `src/core/acp/ACPTypes.ts` does not model `session/new.models`, `session/new.configOptions`, `session/load.models`, or `session/load.configOptions`.
- The UI helper text assumes that an empty result means “Provider did not report models via ACP,” even though the runtime has not been checking the primary ACP session setup responses.

## Key Observation

Real provider behavior and the installed ACP SDK schema both show that model information is exposed during session setup:

- `session/new` may return `models`, `modes`, and `configOptions`
- `session/load` may return `models`, `modes`, and `configOptions`
- `models.availableModels` is the most direct catalog when present
- `configOptions` with `id === "model"` is a valid ACP fallback when `models` is absent

This means the correct ACP-first discovery flow is session-backed, not initialize-backed.

## Recommended Approach

Move provider model discovery to session setup and treat `session/new` as the primary source of truth. When the runtime needs an accurate catalog for a provider, it should create or reuse the provider runtime, create a lightweight session, and extract model options from the response. The extraction order should be:

1. `session/new.models.availableModels`
2. `session/new.configOptions` entry where `id === "model"`

The same normalization logic should also support `session/load` responses for resumed sessions.

`initialize` should continue to establish connection compatibility and base capabilities, but it should no longer be treated as the primary model catalog source.

## Architecture

### ACP schema alignment

Update local ACP types to match the upstream SDK schema already installed in `node_modules/@agentclientprotocol/sdk/schema/schema.json`.

Required additions:

- `ACPSessionModelInfo`
- `ACPSessionModelState`
- `ACPSessionConfigOption` and select-option support sufficient for model extraction
- richer `ACPSessionNewResult`
- richer `ACPSessionLoadResult`

`ACPClient.createSession(...)` should return the richer session result, and `ACPClient.loadSession(...)` should return the richer load result instead of `void`.

### Shared model normalization

Introduce one normalization path that can build `ProviderModelOption[]` from either:

- ACP `SessionModelState.availableModels`
- ACP session `configOptions` model select options

Preferred output shape remains:

```ts
interface ProviderModelOption {
  id: string;
  title?: string;
  contextWindowTokens: number | null;
}
```

For session-backed discovery, most providers expose `name` and optional `description`, but not `contextWindowTokens`. The normalized result should therefore populate:

- `id` from `modelId` or config option `value`
- `title` from `name`
- `contextWindowTokens` as `null` unless explicitly available

### Runtime-owned discovery

The Electrobun runtime remains the source of truth for provider model catalogs.

When a provider runtime is created for draft-mode use:

1. connect
2. initialize
3. create a session
4. extract models from the `session/new` response
5. record the discovered catalog in the provider model catalog store

This allows the UI to receive an accurate ACP-backed model list before the first prompt.

### Session-backed draft behavior

Draft-mode discovery should be session-backed because that is where the data exists. The created session is not a separate “discovery protocol”; it is a normal ACP session whose setup metadata is also used to populate the picker.

This is acceptable because:

- it stays within ACP
- it uses the same runtime/session lifecycle as real chat
- it avoids provider-specific probing logic

## Data Flow

### Draft mode discovery

1. User enters draft mode and selects a provider.
2. The UI asks the runtime for the provider catalog.
3. If an existing provider runtime for the same provider and cwd already exists, reuse it and return the cached catalog.
4. Otherwise, create the provider runtime.
5. During runtime creation, call `initialize` and then `session/new`.
6. Normalize models from `result.models.availableModels`.
7. If `result.models` is absent or empty, normalize the `configOptions` entry with `id === "model"`.
8. Store the result in the provider model catalog store.
9. Return the catalog to the UI.

### Existing session load

When the runtime resumes or switches to an existing session using `session/load`, it should also normalize any returned `models` or `configOptions` and refresh the provider catalog with that data.

## UI Behavior

- The picker always includes **Default model**.
- If session-backed discovery has already succeeded, show discovered models immediately.
- If discovery is in progress, the picker may temporarily show only **Default model** without presenting that as a failure.
- If ACP session setup returns no models and no model config option, keep **Default model** available and show a fallback explanation.
- If a previously selected model disappears from the discovered catalog, fall back to **Default model**.

## Capability Handling

The runtime should stop treating `sessionCapabilities.setModel` as the authoritative signal for model selection support. The installed ACP schema already includes `session/set_model` as an unstable method, while real providers expose model options through session setup responses and may not advertise a dedicated `setModel` capability in `initialize`.

For this slice:

- keep calling `session/set_model` when the user explicitly selects a non-default model
- do not block model picker rendering solely because `initialize.agentCapabilities.sessionCapabilities` lacks `setModel`
- treat actual session-backed model availability as the practical indicator that model selection is supported

## Error Handling

- Failure to discover models must not block chat.
- A failed or empty discovery must not erase a previously known non-empty catalog.
- A provider process startup failure should surface as runtime error state, but the picker should still allow **Default model**.
- If `session/new` succeeds but returns no model metadata, store an attempted-empty catalog so the UI can explain the result accurately.
- Config-option fallback must be used only when the dedicated `models` state is absent or empty.

## Testing

Add or update tests for:

1. ACP type/client handling of richer `session/new` and `session/load` results.
2. normalization from `SessionModelState.availableModels`.
3. fallback normalization from `configOptions` where `id === "model"`.
4. provider catalog store behavior that preserves last known non-empty results.
5. bun runtime recording discovery from `session/new` instead of `initialize._meta`.
6. UI helper text for “not yet discovered” vs “ACP returned no models”.
7. selection fallback to **Default model** when a chosen model is no longer present.

## Documentation Changes

Update user-facing docs that currently describe model discovery as initialize-metadata-driven so they reflect session-backed ACP discovery instead.

## Implementation Notes

- Reuse existing provider runtime and catalog store patterns instead of introducing a separate discovery service.
- Keep the extraction code centralized so runtime and adapter flows do not drift.
- Prefer `models.availableModels` over `configOptions` whenever both are present, because it is the more direct session model representation.
- Treat public ACP website prose as less authoritative than the installed schema and real provider behavior when they diverge in unstable areas.
