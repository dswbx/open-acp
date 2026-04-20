# Dynamic Model Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded provider model picker with a runtime-discovered, provider-scoped model catalog that always offers `Default` and reuses the last successful model list across sessions.

**Architecture:** Introduce shared provider-model catalog types and normalization helpers, then add a small Bun-side catalog store that updates from ACP `initialize` results and exposes a typed RPC endpoint. Update the mainview bridge and `App.tsx` to hydrate model options from that central store, keep `Default` available before discovery, and fall back to `Default` when a selected model disappears.

**Tech Stack:** TypeScript + React 19 + Electrobun RPC + ACP client + Vitest

---

## File Structure and Responsibilities

- **Create:** `src/shared/providerModels.ts` — shared `SmokeProvider`, provider model catalog/types, and normalization helpers for ACP `_meta.models`.
- **Modify:** `src/shared/AppRPC.ts` — re-export shared provider types and add `getProviderModelCatalog` request/response types.
- **Create:** `src/bun/providerModelCatalogStore.ts` — Bun runtime store for provider-scoped model catalogs with “keep last non-empty catalog” semantics.
- **Modify:** `src/bun/index.ts` — populate the runtime store from `client.initialize(...)`, serve `getProviderModelCatalog`, and reuse the store during session/message flow.
- **Modify:** `src/mainview/bridge/SmokeBridge.ts` — add model-catalog fetch method to the bridge contract.
- **Modify:** `src/mainview/bridge/ElectrobunSmokeBridge.ts` — call the new RPC request.
- **Create:** `src/mainview/providerModelCatalogState.ts` — pure UI helpers for initial catalog state, option lookup, and invalid-selection fallback.
- **Modify:** `src/mainview/App.tsx` — remove `PROVIDER_MODELS`, hydrate catalogs from the runtime, render dynamic options, and keep selected model values consistent.
- **Modify:** `README.md` — describe runtime-backed model discovery instead of static presets.
- **Create:** `tests/shared/providerModels.test.ts` — unit tests for normalization and empty/default catalog helpers.
- **Create:** `tests/bun/providerModelCatalogStore.test.ts` — unit tests for cache-preserving runtime store behavior.
- **Create:** `tests/ui/providerModelCatalogState.test.ts` — unit tests for frontend option/fallback logic.
- **Modify:** `tests/ui/App.test.tsx` — update shell assertions to reflect dynamic model picker copy.

---

### Task 1: Extract shared provider model catalog primitives

**Files:**

- Create: `src/shared/providerModels.ts`
- Modify: `src/shared/AppRPC.ts`
- Test: `tests/shared/providerModels.test.ts`

- [ ] **Step 1: Write the failing shared-model tests**

```ts
import { describe, expect, it } from "vitest";
import {
  createEmptyProviderModelCatalog,
  normalizeProviderModelOptions,
  type ProviderModelCatalog,
  type SmokeProvider,
} from "../../src/shared/providerModels.ts";

describe("providerModels", () => {
  it("creates an empty provider catalog with discovery unset", () => {
    const provider: SmokeProvider = "codex";
    const catalog: ProviderModelCatalog = createEmptyProviderModelCatalog(provider);

    expect(catalog).toEqual({
      provider: "codex",
      models: [],
      hasAttemptedDiscovery: false,
      source: "empty",
    });
  });

  it("normalizes ACP model metadata into stable model options", () => {
    expect(
      normalizeProviderModelOptions([
        { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: 128000 },
        { title: "Missing ID", contextWindowTokens: "big" },
        "skip-me",
      ]),
    ).toEqual([
      { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: 128000 },
      { id: "unknown-model", title: "Missing ID", contextWindowTokens: null },
    ]);
  });
});
```

- [ ] **Step 2: Run the focused test to confirm the missing module**

Run: `bunx vitest run tests/shared/providerModels.test.ts`  
Expected: FAIL with module-not-found for `src/shared/providerModels.ts`.

- [ ] **Step 3: Implement the shared types and normalization helpers**

```ts
// src/shared/providerModels.ts
export type SmokeProvider = "codex" | "claude" | "opencode";

export interface ProviderModelOption {
  id: string;
  title?: string;
  contextWindowTokens: number | null;
}

export interface ProviderModelCatalog {
  provider: SmokeProvider;
  models: ProviderModelOption[];
  hasAttemptedDiscovery: boolean;
  lastUpdatedAt?: string;
  source: "discovered" | "empty";
}

export function createEmptyProviderModelCatalog(provider: SmokeProvider): ProviderModelCatalog {
  return {
    provider,
    models: [],
    hasAttemptedDiscovery: false,
    source: "empty",
  };
}

export function normalizeProviderModelOptions(modelsMeta: unknown): ProviderModelOption[] {
  if (!Array.isArray(modelsMeta)) {
    return [];
  }

  return modelsMeta
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .map((entry) => ({
      id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : "unknown-model",
      title: typeof entry.title === "string" ? entry.title : undefined,
      contextWindowTokens:
        typeof entry.contextWindowTokens === "number" ? entry.contextWindowTokens : null,
    }));
}
```

```ts
// src/shared/AppRPC.ts
export type { ProviderModelCatalog, ProviderModelOption, SmokeProvider } from "./providerModels.ts";
```

- [ ] **Step 4: Run shared and adapter regression tests**

Run: `bunx vitest run tests/shared/providerModels.test.ts tests/adapters/CodexAdapter.test.ts tests/adapters/ClaudeCodeAdapter.test.ts tests/adapters/OpenCodeAdapter.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the shared model primitives**

```bash
git add src/shared/providerModels.ts src/shared/AppRPC.ts tests/shared/providerModels.test.ts
git commit -m "feat: add shared provider model catalog primitives"
```

---

### Task 2: Add a Bun-side provider model catalog store

**Files:**

- Create: `src/bun/providerModelCatalogStore.ts`
- Test: `tests/bun/providerModelCatalogStore.test.ts`

- [ ] **Step 1: Write the failing Bun store tests**

```ts
import { describe, expect, it } from "vitest";
import { createProviderModelCatalogStore } from "../../src/bun/providerModelCatalogStore.ts";

describe("providerModelCatalogStore", () => {
  it("stores the first non-empty discovery result", () => {
    const store = createProviderModelCatalogStore();

    store.recordDiscovery(
      "claude",
      [{ id: "claude-sonnet-4.5", contextWindowTokens: null }],
      "2026-04-17T09:00:00.000Z",
    );

    expect(store.get("claude")).toEqual({
      provider: "claude",
      models: [{ id: "claude-sonnet-4.5", contextWindowTokens: null }],
      hasAttemptedDiscovery: true,
      lastUpdatedAt: "2026-04-17T09:00:00.000Z",
      source: "discovered",
    });
  });

  it("keeps the last successful catalog when a later discovery is empty", () => {
    const store = createProviderModelCatalogStore();

    store.recordDiscovery(
      "claude",
      [{ id: "claude-sonnet-4.5", contextWindowTokens: null }],
      "2026-04-17T09:00:00.000Z",
    );
    store.recordDiscovery("claude", [], "2026-04-17T09:05:00.000Z");

    expect(store.get("claude").models).toEqual([
      { id: "claude-sonnet-4.5", contextWindowTokens: null },
    ]);
    expect(store.get("claude").lastUpdatedAt).toBe("2026-04-17T09:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run the failing Bun store test**

Run: `bunx vitest run tests/bun/providerModelCatalogStore.test.ts`  
Expected: FAIL with module-not-found for `providerModelCatalogStore.ts`.

- [ ] **Step 3: Implement the runtime catalog store**

```ts
import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog,
  type ProviderModelOption,
  type SmokeProvider,
} from "../shared/providerModels.ts";

export function createProviderModelCatalogStore() {
  const catalogs = new Map<SmokeProvider, ProviderModelCatalog>();

  const ensure = (provider: SmokeProvider): ProviderModelCatalog => {
    const existing = catalogs.get(provider);
    if (existing) {
      return existing;
    }
    const empty = createEmptyProviderModelCatalog(provider);
    catalogs.set(provider, empty);
    return empty;
  };

  return {
    get(provider: SmokeProvider): ProviderModelCatalog {
      return ensure(provider);
    },
    recordDiscovery(
      provider: SmokeProvider,
      models: ProviderModelOption[],
      timestamp: string,
    ): ProviderModelCatalog {
      const existing = ensure(provider);
      if (models.length === 0 && existing.models.length > 0) {
        const next = { ...existing, hasAttemptedDiscovery: true };
        catalogs.set(provider, next);
        return next;
      }

      const next: ProviderModelCatalog = {
        provider,
        models,
        hasAttemptedDiscovery: true,
        lastUpdatedAt: models.length > 0 ? timestamp : existing.lastUpdatedAt,
        source: models.length > 0 ? "discovered" : "empty",
      };
      catalogs.set(provider, next);
      return next;
    },
  };
}
```

- [ ] **Step 4: Run the Bun store test again**

Run: `bunx vitest run tests/bun/providerModelCatalogStore.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the runtime catalog store**

```bash
git add src/bun/providerModelCatalogStore.ts tests/bun/providerModelCatalogStore.test.ts
git commit -m "feat: add bun provider model catalog store"
```

---

### Task 3: Wire runtime discovery and RPC catalog retrieval

**Files:**

- Modify: `src/shared/AppRPC.ts`
- Modify: `src/bun/index.ts`
- Test: `tests/bun/providerModelCatalogStore.test.ts`

- [ ] **Step 1: Extend the failing Bun store test to cover `initialize`-driven updates**

```ts
import { normalizeProviderModelOptions } from "../../src/shared/providerModels.ts";

it("records normalized initialize metadata without clearing cached models on empty metadata", () => {
  const store = createProviderModelCatalogStore();

  store.recordDiscovery(
    "codex",
    normalizeProviderModelOptions([{ id: "gpt-5-mini", title: "GPT-5 mini" }]),
    "2026-04-17T09:10:00.000Z",
  );
  store.recordDiscovery(
    "codex",
    normalizeProviderModelOptions(undefined),
    "2026-04-17T09:11:00.000Z",
  );

  expect(store.get("codex").models).toEqual([
    { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: null },
  ]);
});
```

- [ ] **Step 2: Run the focused Bun test before wiring runtime code**

Run: `bunx vitest run tests/bun/providerModelCatalogStore.test.ts`  
Expected: PASS after the test extension is implemented against the existing store helper.

- [ ] **Step 3: Add the RPC contract and update `src/bun/index.ts` to use the store**

```ts
// src/shared/AppRPC.ts
export interface GetProviderModelCatalogParams {
  provider: SmokeProvider;
  cwd?: string;
}

export interface GetProviderModelCatalogResult {
  provider: SmokeProvider;
  catalog: ProviderModelCatalog;
}
```

```ts
// src/bun/index.ts
const providerModelCatalogStore = createProviderModelCatalogStore();

async function createProviderRuntime(...) {
  const initializeResult = await client.initialize({
    protocolVersion: 1,
    clientCapabilities: { terminal: true },
    clientInfo: { name: "agent-orchestrator-poc", title: "Agent Orchestrator POC", version: "0.1.0" }
  });

  providerModelCatalogStore.recordDiscovery(
    provider,
    normalizeProviderModelOptions(initializeResult._meta?.models),
    createTimestamp()
  );
}

const rpc = BrowserView.defineRPC<OrchestratorRPC>({
  handlers: {
    requests: {
      getProviderModelCatalog: async ({ provider, cwd }) => {
        await ensureProviderRuntime(provider, cwd ?? process.cwd());
        return {
          provider,
          catalog: providerModelCatalogStore.get(provider)
        };
      }
    }
  }
});
```

- [ ] **Step 4: Run Bun store tests plus a typecheck**

Run: `bunx vitest run tests/bun/providerModelCatalogStore.test.ts && bun run typecheck:core`  
Expected: PASS.

- [ ] **Step 5: Commit the runtime wiring**

```bash
git add src/shared/AppRPC.ts src/bun/index.ts tests/bun/providerModelCatalogStore.test.ts
git commit -m "feat: expose runtime provider model catalogs"
```

---

### Task 4: Replace static model options in the mainview

**Files:**

- Modify: `src/mainview/bridge/SmokeBridge.ts`
- Modify: `src/mainview/bridge/ElectrobunSmokeBridge.ts`
- Create: `src/mainview/providerModelCatalogState.ts`
- Modify: `src/mainview/App.tsx`
- Create: `tests/ui/providerModelCatalogState.test.ts`
- Modify: `tests/ui/App.test.tsx`

- [ ] **Step 1: Write the failing UI-state tests**

```ts
import { describe, expect, it } from "vitest";
import {
  createInitialProviderModelCatalogs,
  getSelectedModelValue,
  getProviderModelOptions,
} from "../../src/mainview/providerModelCatalogState.ts";

describe("providerModelCatalogState", () => {
  it("starts every provider with an empty catalog", () => {
    const catalogs = createInitialProviderModelCatalogs();
    expect(catalogs.codex.models).toEqual([]);
    expect(catalogs.claude.models).toEqual([]);
    expect(catalogs.opencode.models).toEqual([]);
  });

  it("falls back to the default select value when a selected model disappears", () => {
    expect(
      getSelectedModelValue("missing-model", {
        provider: "codex",
        models: [{ id: "gpt-5-mini", contextWindowTokens: null }],
        hasAttemptedDiscovery: true,
        source: "discovered",
      }),
    ).toBe("");
  });

  it("returns discovered model ids in select order", () => {
    expect(
      getProviderModelOptions({
        provider: "codex",
        models: [
          { id: "gpt-5-mini", contextWindowTokens: null },
          { id: "gpt-5.2", contextWindowTokens: 200000 },
        ],
        hasAttemptedDiscovery: true,
        source: "discovered",
      }).map((model) => model.id),
    ).toEqual(["gpt-5-mini", "gpt-5.2"]);
  });
});
```

- [ ] **Step 2: Run the failing UI-state test**

Run: `bunx vitest run tests/ui/providerModelCatalogState.test.ts`  
Expected: FAIL with module-not-found for `providerModelCatalogState.ts`.

- [ ] **Step 3: Implement the bridge method, UI helper, and `App.tsx` hydration**

```ts
// src/mainview/bridge/SmokeBridge.ts
getProviderModelCatalog(
  provider: SmokeProvider
): Promise<GetProviderModelCatalogResult>;
```

```ts
// src/mainview/providerModelCatalogState.ts
export function getSelectedModelValue(
  selectedModel: string,
  catalog: ProviderModelCatalog,
): string {
  return selectedModel.length > 0 && !catalog.models.some((model) => model.id === selectedModel)
    ? ""
    : selectedModel;
}
```

```ts
// src/mainview/App.tsx
interface AppState {
  providerModelCatalogs: Record<SmokeProvider, ProviderModelCatalog>;
  // existing fields...
}

componentDidMount(): void {
  // existing theme + subscription logic...
  void this.hydrateProviderModelCatalog(this.state.selectedProvider);
}

private async hydrateProviderModelCatalog(provider: SmokeProvider): Promise<void> {
  if (!this.smokeBridge.isAvailable()) {
    return;
  }

  const result = await this.smokeBridge.getProviderModelCatalog(provider);
  this.setState((previousState) => ({
    providerModelCatalogs: {
      ...previousState.providerModelCatalogs,
      [provider]: result.catalog
    },
    selectedModels: {
      ...previousState.selectedModels,
      [provider]: getSelectedModelValue(previousState.selectedModels[provider], result.catalog)
    }
  }));
}
```

- [ ] **Step 4: Update the UI shell test and run frontend regression tests**

```ts
// tests/ui/App.test.tsx
expect(html).toContain("Default model");
expect(html).not.toContain("gpt-5.3-codex");
```

Run: `bunx vitest run tests/ui/providerModelCatalogState.test.ts tests/ui/App.test.tsx tests/ui/ChatSurface.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit the dynamic model picker UI**

```bash
git add src/mainview/bridge/SmokeBridge.ts src/mainview/bridge/ElectrobunSmokeBridge.ts src/mainview/providerModelCatalogState.ts src/mainview/App.tsx tests/ui/providerModelCatalogState.test.ts tests/ui/App.test.tsx
git commit -m "feat: hydrate model picker from runtime catalog"
```

---

### Task 5: Document the new behavior and run full regression

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update the README model-picker description**

```md
3. The model selector always starts with **Default model**.
4. After the runtime initializes the selected provider, the picker updates with any models that provider reports through ACP metadata.
5. If a provider does not report models, the picker stays on **Default model** while chat continues to work.
```

- [ ] **Step 2: Run the repository regression suite**

Run: `bun run test && bun run typecheck && bun run build`  
Expected: PASS.

- [ ] **Step 3: Commit the docs + regression pass**

```bash
git add README.md
git commit -m "docs: describe dynamic provider model discovery"
```

---

## Self-Review Checklist

- **Spec coverage:** The plan covers shared model normalization, runtime-owned provider catalogs, typed RPC access, dynamic UI hydration, `Default` fallback, cache retention on failed/empty discovery, and README/test updates.
- **Placeholder scan:** No `TODO`/`TBD` placeholders remain; every task lists exact file paths, test files, commands, and concrete code snippets.
- **Type consistency:** `SmokeProvider`, `ProviderModelCatalog`, and `ProviderModelOption` are introduced once in `src/shared/providerModels.ts` and then reused consistently in the Bun runtime, bridge, and UI helper/module tasks.
