# Dynamic Model Catalog Design

## Problem

The main chat UI currently hard-codes provider model lists in `src/mainview/App.tsx`, even though the adapter layer already knows how to normalize agent-reported model catalogs from ACP `initialize` metadata. This creates drift risk, makes the picker stale when providers change their supported models, and prevents reuse of discovered model lists across sessions.

## Goals

- Replace hard-coded provider model presets with dynamically discovered model catalogs.
- Keep **Default** available immediately, even before discovery completes.
- Store discovered models centrally so later sessions for the same provider can reuse them.
- Treat ACP model catalogs as optional and best-effort without blocking chat when absent.

## Non-Goals

- Adding background polling or manual model refresh controls.
- Persisting model catalogs beyond the lifetime of the current runtime process.
- Changing provider/session architecture beyond what is needed to support central catalog reuse.

## Current State

- `src/mainview/App.tsx` owns a static `PROVIDER_MODELS` map.
- `src/bun/index.ts` initializes ACP clients directly for the real chat flow, but it does not expose discovered model metadata to the UI.
- The adapter layer already normalizes `result._meta.models` into `NormalizedAgentCapabilities.models`, which confirms the protocol shape and fallback behavior the app should follow.
- ACP does not guarantee model catalogs in the stable schema, so missing metadata is a valid outcome.

## Recommended Approach

Add a central, provider-scoped model catalog store in the Electrobun runtime and expose it over typed RPC to the webview. The UI should always render **Default** and then hydrate provider-specific model options from the runtime-owned catalog. Discovery should occur during normal provider runtime initialization, and the runtime should retain the last successful non-empty catalog for each provider so later sessions can reuse it.

This keeps the source of truth close to the ACP client lifecycle, avoids duplicating discovery logic in the frontend, and matches the desired fallback behavior when discovery is unavailable.

## Architecture

### Runtime-owned provider model catalog

Add a central catalog in `src/bun/index.ts` keyed by `SmokeProvider`.

Suggested shape:

```ts
interface ProviderModelCatalog {
  models: ProviderModelOption[];
  hasAttemptedDiscovery: boolean;
  lastUpdatedAt?: string;
  source: "discovered" | "empty";
}
```

`ProviderModelOption` should contain the normalized fields the UI needs, at minimum:

```ts
interface ProviderModelOption {
  id: string;
  title?: string;
  contextWindowTokens?: number | null;
}
```

The catalog is provider-scoped, not session-scoped and not cwd-scoped. All sessions for the same provider reuse the same in-memory catalog for the lifetime of the Bun runtime.

### Discovery integrated with runtime initialization

The real chat runtime already calls `client.initialize(...)` while creating provider runtimes. Capture that `initialize` result, normalize `_meta.models`, and update the central provider catalog from that existing lifecycle step instead of adding a separate discovery-only protocol path.

This should happen whenever a new provider runtime is created. Reusing an existing runtime should reuse the existing catalog.

### RPC surface

Extend `src/shared/AppRPC.ts` and the webview bridge with a request that lets the UI fetch a provider catalog from the runtime.

Suggested request:

```ts
getProviderModelCatalog(provider: SmokeProvider, cwd?: string)
```

Suggested response:

```ts
interface ProviderModelCatalogResult {
  provider: SmokeProvider;
  catalog: ProviderModelCatalog;
}
```

The runtime implementation may initialize a provider runtime if needed in order to obtain discovery data, but it should continue to reuse the same provider runtime state and avoid unnecessary duplicate runtime creation.

## UI Design

### Model picker behavior

Replace the static `PROVIDER_MODELS` constant in `src/mainview/App.tsx` with centralized frontend state such as:

```ts
providerModelCatalogs: Record<SmokeProvider, ProviderModelCatalog>
```

The model picker options should always render:

1. `Default`
2. any discovered or cached models for the selected provider

If the runtime has no discovered models yet, the picker shows only `Default`. When discovery completes, the picker updates in place to show the fetched catalog.

### Selection rules

- New sessions can be created before discovery has completed.
- Sending a message with `Default` should continue the current behavior of not explicitly calling `session/set_model`.
- If a user selected a model that later disappears from the provider catalog, the UI should automatically fall back to `Default`.
- Existing selected values should remain stable when the refreshed catalog still contains that model.

### Session reuse

Because the runtime owns the provider catalog, creating additional sessions for the same provider should reuse the same discovered list without requiring a new list in the UI or another discovery-specific code path.

## Data Flow

1. The UI mounts or the selected provider changes.
2. The UI requests `getProviderModelCatalog(provider, cwd?)`.
3. The runtime returns the current provider catalog immediately if already populated.
4. If the runtime needs to create a provider runtime, it performs ACP `initialize`, extracts `_meta.models`, normalizes the result, stores it in the provider catalog, and returns that catalog.
5. The UI updates the provider picker state for that provider.
6. Later session creation and message sending continue to read from the same provider-scoped catalog.

## Error Handling and Fallbacks

- Chat must remain usable even if discovery fails.
- `Default` must always remain selectable.
- If discovery fails because the process cannot start, auth is missing, or ACP omits model metadata, the runtime must not clear a previously successful non-empty catalog.
- If discovery produces no model metadata and there is no prior successful catalog, the runtime should store an empty catalog state with `hasAttemptedDiscovery = true`.
- Only a successful non-empty discovery should replace an existing provider catalog.

This preserves the last known good model list while still allowing the app to function when a provider cannot currently advertise models.

## Refresh Rules

- Discover models the first time a provider runtime is initialized.
- Reuse the cached provider catalog for additional sessions.
- Refresh the provider catalog when the underlying provider runtime is recreated.
- Do not add background refresh or manual refresh controls in this slice.

## Testing

Add or update tests for:

1. runtime extraction and normalization of model metadata from ACP `initialize`
2. catalog updates on successful discovery
3. preserving cached catalogs when later discovery is empty or fails
4. RPC responses for provider model catalog requests
5. UI rendering `Default` before discovery and discovered models after hydration
6. UI fallback to `Default` when a previously selected model is no longer available

## Implementation Notes

- Prefer reusing the existing model metadata normalization pattern already present in the adapter layer rather than creating a second incompatible shape.
- Keep the runtime catalog logic small and local to the Electrobun real-chat path unless broader orchestration adoption is part of a later refactor.
- Update README or other user-facing docs where the model picker behavior is described so the behavior matches the runtime-backed catalog approach.
