# Provider Model Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make provider model discovery come from ACP session setup (`session/new` and `session/load`) with config-option fallback so the picker is accurate for Claude, Codex, and OpenCode before the first chat prompt.

**Architecture:** Keep the existing Electrobun runtime and provider catalog store, but move discovery away from `initialize._meta.models` and into session-backed ACP responses. Align the local ACP types with the installed SDK schema, centralize normalization in `src/shared/providerModels.ts`, then update the bun runtime and UI to hydrate catalogs from session setup while preserving the current **Default model** fallback.

**Tech Stack:** TypeScript + React 19 + Electrobun RPC + ACP stdio client + Vitest

---

## File Structure and Responsibilities

- **Modify:** `src/core/acp/ACPTypes.ts` — add the session setup model/config option types and remove the stale `sessionCapabilities.setModel` assumption from the local schema.
- **Modify:** `src/core/acp/ACPClient.ts` — return rich `session/new` and `session/load` payloads instead of discarding setup metadata.
- **Modify:** `tests/acp/ACPClient.test.ts` — lock the richer client contract with focused request/response tests.
- **Modify:** `src/shared/providerModels.ts` — keep the legacy initialize-metadata normalizer, then add session-backed ACP model normalization helpers.
- **Modify:** `tests/shared/providerModels.test.ts` — cover `models.availableModels`, config-option fallback, and “models beat config options” precedence.
- **Create:** `src/bun/providerModelDiscovery.ts` — pure runtime helper that converts ACP session setup responses into provider model catalogs.
- **Create:** `tests/bun/providerModelDiscovery.test.ts` — verify session-backed discovery behavior without booting Electrobun.
- **Modify:** `src/bun/index.ts` — record discovery from `session/new` and `session/load`, not from `initialize`.
- **Modify:** `tests/bun/providerModelCatalogStore.test.ts` — keep the “last known non-empty catalog wins” contract intact after the discovery source changes.
- **Modify:** `src/mainview/App.tsx` — fetch draft-mode catalogs when entering draft mode or switching providers so the picker is accurate before first send.
- **Modify:** `src/mainview/providerModelCatalogState.ts` — keep helper-text logic pure and update the message to mention ACP session setup instead of generic metadata.
- **Modify:** `tests/ui/App.test.tsx` — assert the new draft-mode fetch behavior and keep the initial-mount no-prefetch contract.
- **Modify:** `tests/ui/providerModelCatalogState.test.ts` — assert the updated helper text.
- **Modify:** `src/core/adapters/ClaudeCodeAdapter.ts`
- **Modify:** `src/core/adapters/CodexAdapter.ts`
- **Modify:** `src/core/adapters/OpenCodeAdapter.ts` — reuse the shared initialize-metadata normalizer and stop pretending `initialize` can authoritatively advertise `setModel`.
- **Modify:** `tests/adapters/ClaudeCodeAdapter.test.ts`
- **Modify:** `tests/adapters/CodexAdapter.test.ts`
- **Modify:** `tests/adapters/OpenCodeAdapter.test.ts` — update expectations to the shared helper + `setModel: false` mapping.
- **Modify:** `README.md` — describe the session-backed discovery behavior accurately.

### Scope Guard

This plan intentionally keeps discovery **ACP-only** and **runtime-first**:

1. No provider-specific CLI scraping.
2. No background refresh loop.
3. No persistent on-disk model cache.
4. No migration of the UI onto `SessionOrchestrator` / adapter-based session setup in this slice.

The adapters are cleaned up only enough to stay type-consistent and DRY after the ACP schema alignment. The actual user-facing picker remains powered by the Electrobun runtime path in `src/bun/index.ts`.

### Ambiguity Resolution

The approved design says the picker should be accurate before the first prompt, but the current app deliberately avoids model discovery on initial mount. This plan resolves that tension like this:

1. **Initial mount still does not prefetch anything.**
2. **Entering draft mode does fetch the default draft provider’s catalog.**
3. **Switching providers while drafting fetches that provider’s catalog immediately.**
4. **Selecting an already-active session still rehydrates that provider catalog.**

This keeps startup cheap while still making the picker accurate by the time the user is actually preparing a session.

---

### Task 1: Align ACP session setup types and client responses

**Files:**

- Modify: `src/core/acp/ACPTypes.ts`
- Modify: `src/core/acp/ACPClient.ts`
- Test: `tests/acp/ACPClient.test.ts`

- [ ] **Step 1: Write the failing ACP client tests**

```ts
// tests/acp/ACPClient.test.ts
import { describe, expect, it, vi } from "vitest";
import { ACPClient, ACPVersionMismatchError } from "../../src/core/acp/ACPClient.ts";
import { ACPTransport } from "../../src/core/acp/ACPTransport.ts";
import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
} from "../../src/core/acp/ACPTypes.ts";

class TestACPTransport extends ACPTransport {
  readonly requests: ACPJsonRpcRequest[] = [];
  readonly notifications: ACPJsonRpcNotification[] = [];
  shouldFailSend = false;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async sendRequest(request: ACPJsonRpcRequest): Promise<void> {
    if (this.shouldFailSend) {
      throw new Error("transport send failed");
    }
    this.requests.push(request);
  }

  async sendNotification(notification: ACPJsonRpcNotification): Promise<void> {
    this.notifications.push(notification);
  }

  inject(message: ACPInboundMessage): void {
    this.dispatchIncomingMessage(message);
  }
}

describe("ACPClient", () => {
  it("returns session/new setup metadata including models and config options", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const initializePromise = client.initialize({ protocolVersion: 1 });
    const initializeRequest = transport.requests[0];
    transport.inject({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {},
      },
    });
    await initializePromise;

    const createSessionPromise = client.createSession({
      cwd: "/workspace",
      mcpServers: [],
    });
    const createSessionRequest = transport.requests[1];

    transport.inject({
      jsonrpc: "2.0",
      id: createSessionRequest.id,
      result: {
        sessionId: "session-1",
        models: {
          currentModelId: "gpt-5-mini",
          availableModels: [
            {
              modelId: "gpt-5-mini",
              name: "GPT-5 mini",
              description: "Fast coding model",
            },
          ],
        },
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "gpt-5-mini",
            options: [
              {
                value: "gpt-5-mini",
                name: "GPT-5 mini",
              },
            ],
          },
        ],
      },
    });

    await expect(createSessionPromise).resolves.toMatchObject({
      sessionId: "session-1",
      models: {
        currentModelId: "gpt-5-mini",
      },
      configOptions: [expect.objectContaining({ id: "model" })],
    });
  });

  it("returns session/load setup metadata instead of undefined", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const initializePromise = client.initialize({ protocolVersion: 1 });
    const initializeRequest = transport.requests[0];
    transport.inject({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
        },
      },
    });
    await initializePromise;

    const loadSessionPromise = client.loadSession({
      sessionId: "session-1",
      cwd: "/workspace",
      mcpServers: [],
    });
    const loadSessionRequest = transport.requests[1];

    transport.inject({
      jsonrpc: "2.0",
      id: loadSessionRequest.id,
      result: {
        models: {
          currentModelId: "claude-default",
          availableModels: [
            {
              modelId: "claude-default",
              name: "Default (recommended)",
            },
          ],
        },
        configOptions: [],
      },
    });

    await expect(loadSessionPromise).resolves.toMatchObject({
      models: {
        currentModelId: "claude-default",
      },
      configOptions: [],
    });
  });

  it("sends session/set_model requests without requiring initialize to advertise setModel", async () => {
    const transport = new TestACPTransport();
    const client = new ACPClient(transport);

    const initializePromise = client.initialize({
      protocolVersion: 1,
    });
    const initializeRequest = transport.requests[0];

    transport.inject({
      jsonrpc: "2.0",
      id: initializeRequest.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {},
      },
    });
    await initializePromise;

    const setModelPromise = client.setModel({
      sessionId: "session-1",
      modelId: "gpt-5-mini",
    });
    const setModelRequest = transport.requests[1];

    expect(setModelRequest.method).toBe("session/set_model");
    expect(setModelRequest.params).toEqual({
      sessionId: "session-1",
      modelId: "gpt-5-mini",
    });

    transport.inject({
      jsonrpc: "2.0",
      id: setModelRequest.id,
      result: {},
    });

    await expect(setModelPromise).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the focused ACP client test**

Run: `bunx vitest run tests/acp/ACPClient.test.ts`  
Expected: FAIL because `createSession()` only returns `{ sessionId }`, `loadSession()` resolves `undefined`, and the local ACP types do not model session setup `models` / `configOptions`.

- [ ] **Step 3: Update the ACP schema and client return types**

```ts
// src/core/acp/ACPTypes.ts
export interface ACPAgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
  sessionCapabilities?: {
    list?: Record<string, never>;
    fork?: Record<string, never>;
    resume?: Record<string, never>;
    close?: Record<string, never>;
  };
  _meta?: Record<string, unknown>;
}

export interface ACPSessionModelInfo {
  modelId: string;
  name: string;
  description?: string;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionModelState {
  currentModelId: string;
  availableModels: ACPSessionModelInfo[];
  _meta?: Record<string, unknown>;
}

export interface ACPSessionConfigSelectOption {
  value: string;
  name: string;
  description?: string;
}

export interface ACPSessionConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: string;
  currentValue?: string | boolean;
  options?: ACPSessionConfigSelectOption[];
  _meta?: Record<string, unknown>;
}

export interface ACPSessionNewResult {
  sessionId: string;
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
  _meta?: Record<string, unknown>;
}

export interface ACPSessionLoadResult {
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
  _meta?: Record<string, unknown>;
}
```

```ts
// src/core/acp/ACPClient.ts
import type {
  ACPInboundMessage,
  ACPInitializeParams,
  ACPInitializeResult,
  ACPJsonRpcFailure,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse,
  ACPSessionCancelParams,
  ACPSessionListParams,
  ACPSessionListResult,
  ACPSessionLoadParams,
  ACPSessionLoadResult,
  ACPSessionNewParams,
  ACPSessionNewResult,
  ACPSessionPromptParams,
  ACPSessionPromptResult,
  ACPSessionSetModelParams,
  ACPSessionUpdateParams
} from "./ACPTypes.ts";

async createSession(params: ACPSessionNewParams): Promise<ACPSessionNewResult> {
  this.assertInitialized("session/new");
  return this.sendRequest<ACPSessionNewResult>("session/new", params);
}

async loadSession(params: ACPSessionLoadParams): Promise<ACPSessionLoadResult> {
  this.assertInitialized("session/load");
  return this.sendRequest<ACPSessionLoadResult>("session/load", params);
}
```

- [ ] **Step 4: Re-run the ACP client tests and core typecheck**

Run: `bunx vitest run tests/acp/ACPClient.test.ts && bun run typecheck:core`  
Expected: PASS. The ACP client now preserves session setup payloads and core TypeScript still compiles.

- [ ] **Step 5: Commit the ACP schema alignment**

```bash
git add src/core/acp/ACPTypes.ts src/core/acp/ACPClient.ts tests/acp/ACPClient.test.ts
git commit -m "feat: model ACP session setup responses"
```

---

### Task 2: Add shared ACP session model normalization

**Files:**

- Modify: `src/shared/providerModels.ts`
- Test: `tests/shared/providerModels.test.ts`

- [ ] **Step 1: Write the failing normalization tests**

```ts
// tests/shared/providerModels.test.ts
import { describe, expect, it } from "vitest";
import {
  createEmptyProviderModelCatalog,
  normalizeProviderModelOptions,
  normalizeProviderModelOptionsFromSessionConfigOptions,
  normalizeProviderModelOptionsFromSessionModels,
  normalizeProviderModelOptionsFromSessionSetup,
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

  it("normalizes ACP initialize metadata into stable model options", () => {
    expect(
      normalizeProviderModelOptions([
        { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: 128000 },
        { title: "Missing ID", contextWindowTokens: "big" },
        "skip-me",
      ]),
    ).toEqual([
      { id: "gpt-5-mini", title: "GPT-5 mini", contextWindowTokens: 128000 },
      { id: "unknown-model-1", title: "Missing ID", contextWindowTokens: null },
    ]);
  });

  it("normalizes ACP session model state into provider model options", () => {
    expect(
      normalizeProviderModelOptionsFromSessionModels({
        currentModelId: "gpt-5.4/medium",
        availableModels: [
          {
            modelId: "gpt-5.4/medium",
            name: "gpt-5.4 (medium)",
            description: "Balanced reasoning",
          },
          {
            modelId: "gpt-5.4/high",
            name: "gpt-5.4 (high)",
          },
        ],
      }),
    ).toEqual([
      { id: "gpt-5.4/medium", title: "gpt-5.4 (medium)", contextWindowTokens: null },
      { id: "gpt-5.4/high", title: "gpt-5.4 (high)", contextWindowTokens: null },
    ]);
  });

  it("falls back to the ACP model config option when session models are absent", () => {
    expect(
      normalizeProviderModelOptionsFromSessionConfigOptions([
        {
          id: "mode",
          name: "Mode",
          type: "select",
          options: [{ value: "default", name: "Default" }],
        },
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: "haiku",
          options: [
            { value: "default", name: "Default (recommended)" },
            { value: "haiku", name: "Haiku" },
          ],
        },
      ]),
    ).toEqual([
      { id: "default", title: "Default (recommended)", contextWindowTokens: null },
      { id: "haiku", title: "Haiku", contextWindowTokens: null },
    ]);
  });

  it("prefers session models over config option fallback when both are present", () => {
    expect(
      normalizeProviderModelOptionsFromSessionSetup({
        models: {
          currentModelId: "sonnet[1m]",
          availableModels: [
            {
              modelId: "sonnet[1m]",
              name: "Sonnet (1M context)",
            },
          ],
        },
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            options: [{ value: "default", name: "Default (recommended)" }],
          },
        ],
      }),
    ).toEqual([{ id: "sonnet[1m]", title: "Sonnet (1M context)", contextWindowTokens: null }]);
  });
});
```

- [ ] **Step 2: Run the focused shared-model test**

Run: `bunx vitest run tests/shared/providerModels.test.ts`  
Expected: FAIL because the session-backed normalization helpers do not exist yet.

- [ ] **Step 3: Add the ACP session normalization helpers**

```ts
// src/shared/providerModels.ts
import type { ACPSessionConfigOption, ACPSessionModelState } from "../core/acp/ACPTypes.ts";

export function normalizeProviderModelOptions(modelsMeta: unknown): ProviderModelOption[] {
  if (!Array.isArray(modelsMeta)) {
    return [];
  }

  return modelsMeta
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .map((entry, index) => ({
      id: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `unknown-model-${index}`,
      title: typeof entry.title === "string" ? entry.title : undefined,
      contextWindowTokens:
        typeof entry.contextWindowTokens === "number" ? entry.contextWindowTokens : null,
    }));
}

export function normalizeProviderModelOptionsFromSessionModels(
  models: ACPSessionModelState | null | undefined,
): ProviderModelOption[] {
  if (!models) {
    return [];
  }

  return models.availableModels.map((model) => ({
    id: model.modelId,
    title: model.name,
    contextWindowTokens: null,
  }));
}

export function normalizeProviderModelOptionsFromSessionConfigOptions(
  configOptions: ACPSessionConfigOption[] | null | undefined,
): ProviderModelOption[] {
  if (!configOptions) {
    return [];
  }

  const modelOption = configOptions.find(
    (option) => option.id === "model" && option.type === "select",
  );
  if (!modelOption?.options) {
    return [];
  }

  return modelOption.options.map((option) => ({
    id: option.value,
    title: option.name,
    contextWindowTokens: null,
  }));
}

export function normalizeProviderModelOptionsFromSessionSetup(input: {
  models?: ACPSessionModelState | null;
  configOptions?: ACPSessionConfigOption[] | null;
}): ProviderModelOption[] {
  const fromModels = normalizeProviderModelOptionsFromSessionModels(input.models);
  if (fromModels.length > 0) {
    return fromModels;
  }

  return normalizeProviderModelOptionsFromSessionConfigOptions(input.configOptions);
}
```

- [ ] **Step 4: Re-run the shared-model tests**

Run: `bunx vitest run tests/shared/providerModels.test.ts`  
Expected: PASS. The shared model normalizer now handles initialize metadata, session model state, and config-option fallback.

- [ ] **Step 5: Commit the shared normalizer**

```bash
git add src/shared/providerModels.ts tests/shared/providerModels.test.ts
git commit -m "feat: normalize ACP session model catalogs"
```

---

### Task 3: Move bun runtime discovery to `session/new` / `session/load`

**Files:**

- Create: `src/bun/providerModelDiscovery.ts`
- Modify: `src/bun/index.ts`
- Test: `tests/bun/providerModelDiscovery.test.ts`
- Test: `tests/bun/providerModelCatalogStore.test.ts`

- [ ] **Step 1: Write the failing bun discovery tests**

```ts
// tests/bun/providerModelDiscovery.test.ts
import { describe, expect, it } from "vitest";
import { discoverProviderModelsFromSessionSetup } from "../../src/bun/providerModelDiscovery.ts";

describe("providerModelDiscovery", () => {
  it("uses session models when the provider returns SessionModelState", () => {
    expect(
      discoverProviderModelsFromSessionSetup({
        sessionId: "session-1",
        models: {
          currentModelId: "default",
          availableModels: [
            { modelId: "default", name: "Default (recommended)" },
            { modelId: "haiku", name: "Haiku" },
          ],
        },
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            options: [{ value: "fallback", name: "Fallback only" }],
          },
        ],
      }),
    ).toEqual([
      { id: "default", title: "Default (recommended)", contextWindowTokens: null },
      { id: "haiku", title: "Haiku", contextWindowTokens: null },
    ]);
  });

  it("falls back to the model config option when session models are absent", () => {
    expect(
      discoverProviderModelsFromSessionSetup({
        sessionId: "session-1",
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "gpt-5.4",
            options: [
              { value: "gpt-5.4", name: "gpt-5.4" },
              { value: "gpt-5.4-mini", name: "GPT-5.4-Mini" },
            ],
          },
        ],
      }),
    ).toEqual([
      { id: "gpt-5.4", title: "gpt-5.4", contextWindowTokens: null },
      { id: "gpt-5.4-mini", title: "GPT-5.4-Mini", contextWindowTokens: null },
    ]);
  });
});
```

```ts
// tests/bun/providerModelCatalogStore.test.ts
import { describe, expect, it } from "vitest";
import { createProviderModelCatalogStore } from "../../src/bun/providerModelCatalogStore.ts";

describe("providerModelCatalogStore", () => {
  it("stores the first non-empty discovery result", () => {
    const store = createProviderModelCatalogStore();

    store.recordDiscovery(
      "claude",
      [{ id: "claude-sonnet-4.5", title: "Claude Sonnet 4.5", contextWindowTokens: null }],
      "2026-04-17T09:00:00.000Z",
    );

    expect(store.get("claude")).toEqual({
      provider: "claude",
      models: [{ id: "claude-sonnet-4.5", title: "Claude Sonnet 4.5", contextWindowTokens: null }],
      hasAttemptedDiscovery: true,
      lastUpdatedAt: "2026-04-17T09:00:00.000Z",
      source: "discovered",
    });
  });

  it("keeps the last successful catalog when a later discovery is empty", () => {
    const store = createProviderModelCatalogStore();

    store.recordDiscovery(
      "claude",
      [{ id: "claude-sonnet-4.5", title: "Claude Sonnet 4.5", contextWindowTokens: null }],
      "2026-04-17T09:00:00.000Z",
    );
    store.recordDiscovery("claude", [], "2026-04-17T09:05:00.000Z");

    expect(store.get("claude").models).toEqual([
      { id: "claude-sonnet-4.5", title: "Claude Sonnet 4.5", contextWindowTokens: null },
    ]);
    expect(store.get("claude").lastUpdatedAt).toBe("2026-04-17T09:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run the focused bun tests**

Run: `bunx vitest run tests/bun/providerModelDiscovery.test.ts tests/bun/providerModelCatalogStore.test.ts`  
Expected: FAIL because `providerModelDiscovery.ts` does not exist and the runtime still records discovery from `initialize._meta.models`.

- [ ] **Step 3: Add the pure discovery helper and wire it into the runtime**

```ts
// src/bun/providerModelDiscovery.ts
import type { ACPSessionLoadResult, ACPSessionNewResult } from "../core/acp/ACPTypes.ts";
import {
  normalizeProviderModelOptionsFromSessionSetup,
  type ProviderModelOption,
} from "../shared/providerModels.ts";

type ACPSetupResult =
  | Pick<ACPSessionNewResult, "models" | "configOptions">
  | Pick<ACPSessionLoadResult, "models" | "configOptions">;

export function discoverProviderModelsFromSessionSetup(
  result: ACPSetupResult,
): ProviderModelOption[] {
  return normalizeProviderModelOptionsFromSessionSetup({
    models: result.models,
    configOptions: result.configOptions,
  });
}
```

```ts
// src/bun/index.ts
import { discoverProviderModelsFromSessionSetup } from "./providerModelDiscovery.ts";

async function createProviderRuntime(
  provider: SmokeProvider,
  cwd: string,
  runtimeOptions: CreateProviderRuntimeOptions = {},
): Promise<ProviderRuntime> {
  const smokeOptions = createSmokeRunnerOptions(provider, DEFAULT_PROMPT, cwd);
  const transport = new StdioACPTransport(smokeOptions.cmd, smokeOptions.args, {
    cwd: smokeOptions.cwd,
    onStderr: (chunk) => {
      const message = normalizeLogMessage(chunk);
      if (!message) {
        return;
      }
      const runtime = providerRuntimes.get(provider);
      if (!runtime?.activeRequestId) {
        return;
      }
      emitChatError(runtime, runtime.activeRequestId, message);
    },
    onExit: (code, signal) => {
      const runtime = providerRuntimes.get(provider);
      if (!runtime) {
        return;
      }
      providerRuntimes.delete(provider);
      if (!runtime.activeRequestId) {
        return;
      }
      emitChatError(
        runtime,
        runtime.activeRequestId,
        `Agent process exited unexpectedly (code=${String(code)}, signal=${signal ?? "none"}).`,
      );
      runtime.activeRequestId = undefined;
    },
  });

  const client = new ACPClient(transport);
  await client.connect();
  await client.initialize({
    protocolVersion: 1,
    clientCapabilities: {
      terminal: true,
    },
    clientInfo: {
      name: "agent-orchestrator-poc",
      title: "Agent Orchestrator POC",
      version: "0.1.0",
    },
  });

  let sessionId = "";
  if (!runtimeOptions.skipSessionCreation) {
    const session = await client.createSession({
      cwd,
      mcpServers: [],
    });
    providerModelCatalogStore.recordDiscovery(
      provider,
      discoverProviderModelsFromSessionSetup(session),
      createTimestamp(),
    );
    sessionId = session.sessionId;
  }

  const runtime: ProviderRuntime = {
    provider,
    cwd,
    transport,
    client,
    sessionId,
  };
  client.onSessionUpdate((params) => {
    handleSessionUpdate(runtime, params);
  });
  return runtime;
}

async function switchRuntimeSession(runtime: ProviderRuntime, sessionId: string): Promise<void> {
  if (runtime.sessionId === sessionId) {
    return;
  }

  const loaded = await runtime.client.loadSession({
    sessionId,
    cwd: runtime.cwd,
    mcpServers: [],
  });
  providerModelCatalogStore.recordDiscovery(
    runtime.provider,
    discoverProviderModelsFromSessionSetup(loaded),
    createTimestamp(),
  );
  runtime.sessionId = sessionId;
  runtime.currentModel = undefined;
}
```

```ts
// src/bun/index.ts inside createChatSession existing-runtime branch
const session = await runtime.client.createSession({
  cwd: runtime.cwd,
  mcpServers: [],
});
providerModelCatalogStore.recordDiscovery(
  provider,
  discoverProviderModelsFromSessionSetup(session),
  createTimestamp(),
);
runtime.sessionId = session.sessionId;
runtime.currentModel = undefined;
```

- [ ] **Step 4: Re-run the bun discovery tests**

Run: `bunx vitest run tests/bun/providerModelDiscovery.test.ts tests/bun/providerModelCatalogStore.test.ts tests/shared/providerModels.test.ts`  
Expected: PASS. Bun discovery now follows ACP session setup and still preserves the last successful non-empty catalog.

- [ ] **Step 5: Commit the runtime discovery shift**

```bash
git add src/bun/providerModelDiscovery.ts src/bun/index.ts tests/bun/providerModelDiscovery.test.ts tests/bun/providerModelCatalogStore.test.ts
git commit -m "feat: discover models from ACP session setup"
```

---

### Task 4: Hydrate draft-mode catalogs in the UI and update docs

**Files:**

- Modify: `src/mainview/App.tsx`
- Modify: `src/mainview/providerModelCatalogState.ts`
- Test: `tests/ui/App.test.tsx`
- Test: `tests/ui/providerModelCatalogState.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Rewrite the failing UI tests around draft-mode hydration**

```tsx
// tests/ui/App.test.tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/mainview/App.tsx";
import { createEmptyProviderModelCatalog } from "../../src/shared/providerModels.ts";
import type { SmokeBridge } from "../../src/mainview/bridge/SmokeBridge.ts";

class RecordingSmokeBridge implements SmokeBridge {
  readonly createSessionCalls: string[] = [];
  readonly modelCatalogRequests: string[] = [];

  isAvailable(): boolean {
    return true;
  }

  async startSmokeTest() {
    throw new Error("not used");
  }

  async sendChatMessage() {
    throw new Error("not used");
  }

  async createChatSession(provider: "codex" | "claude" | "opencode") {
    this.createSessionCalls.push(provider);
    return {
      provider,
      sessionId: `session-${provider}`,
    };
  }

  async getProviderModelCatalog(provider: "codex" | "claude" | "opencode") {
    this.modelCatalogRequests.push(provider);
    return {
      provider,
      catalog: createEmptyProviderModelCatalog(provider),
    };
  }

  subscribe(): () => void {
    return () => {};
  }
}

describe("App UI shell", () => {
  it("does not fetch provider models on initial mount", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        matchMedia: () => ({
          matches: false,
          addEventListener() {},
          removeEventListener() {},
        }),
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          classList: {
            toggle() {},
          },
        },
      },
    });

    try {
      app.setState = (() => undefined) as typeof app.setState;
      app.componentDidMount();
      expect(bridge.modelCatalogRequests).toEqual([]);
      app.componentWillUnmount();
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  });

  it("fetches the draft provider catalog when entering draft mode", async () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleCreateSession(): Promise<void>;
    };

    app.setState = ((updater: any) => {
      const nextState = typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState,
      };
    }) as typeof app.setState;

    await app.handleCreateSession();

    expect(app.state.isDraftingSession).toBe(true);
    expect(bridge.modelCatalogRequests).toEqual(["codex"]);
  });

  it("fetches provider models when switching providers while drafting", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleSelectProvider(provider: "codex" | "claude" | "opencode"): void;
      state: App["state"] & {
        draftProvider: "codex" | "claude" | "opencode";
        isDraftingSession: boolean;
      };
    };

    app.setState = ((updater: any) => {
      const nextState = typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState,
      };
    }) as typeof app.setState;

    app.state = {
      ...app.state,
      isDraftingSession: true,
    };

    app.handleSelectProvider("claude");

    expect(app.state.draftProvider).toBe("claude");
    expect(bridge.modelCatalogRequests).toEqual(["claude"]);
  });
});
```

```ts
// tests/ui/providerModelCatalogState.test.ts
import { describe, expect, it } from "vitest";
import {
  createInitialProviderModelCatalogs,
  getProviderModelHelperText,
  getProviderModelOptions,
  getSelectedModelValue,
} from "../../src/mainview/providerModelCatalogState.ts";

describe("providerModelCatalogState", () => {
  it("explains attempted discovery when ACP session setup returns no models", () => {
    expect(
      getProviderModelHelperText({
        provider: "claude",
        models: [],
        hasAttemptedDiscovery: true,
        source: "empty",
      }),
    ).toBe("Provider did not report models during ACP session setup.");
  });
});
```

- [ ] **Step 2: Run the focused UI tests**

Run: `bunx vitest run tests/ui/App.test.tsx tests/ui/providerModelCatalogState.test.ts`  
Expected: FAIL because draft mode does not fetch catalogs yet and the helper text still mentions generic ACP metadata.

- [ ] **Step 3: Update App draft-mode hydration, helper text, and README**

```ts
// src/mainview/App.tsx
private readonly handleSelectProvider = (provider: SmokeProvider): void => {
  this.setState({
    draftProvider: provider
  });

  if (this.state.isDraftingSession) {
    void this.hydrateProviderModelCatalog(provider);
  }
};

private readonly handleCreateSession = async (): Promise<void> => {
  if (this.state.activeRequestId || this.state.isSending || this.state.isCreatingSession) {
    return;
  }

  if (!this.state.isDraftingSession) {
    this.setState({
      activeSessionId: undefined,
      chatInput: "",
      draftProvider: this.state.selectedProvider,
      isDraftingSession: true
    });
    void this.hydrateProviderModelCatalog(this.state.selectedProvider);
    return;
  }

  const provider = this.state.draftProvider;
  if (!this.smokeBridge.isAvailable()) {
    this.appendLog({
      provider,
      level: "error",
      message: "Electrobun bridge is unavailable. Launch the app with the Electrobun runtime.",
      timestamp: new Date().toISOString()
    });
    return;
  }

  this.setState({
    isCreatingSession: true
  });

  try {
    const created = await this.smokeBridge.createChatSession(provider);
    this.setState((previousState) => ({
      isCreatingSession: false,
      isDraftingSession: false,
      draftProvider: created.provider,
      selectedProvider: created.provider,
      activeSessionId: created.sessionId,
      sessions: this.upsertSession(
        previousState.sessions,
        this.createSessionListItem(
          created.provider,
          created.sessionId,
          getSelectedModelValue(
            previousState.selectedModels[created.provider],
            previousState.providerModelCatalogs[created.provider]
          )
        )
      )
    }));
    void this.hydrateProviderModelCatalog(created.provider);
  } catch (error) {
    this.setState({
      isCreatingSession: false,
      isDraftingSession: true
    });
  }
};
```

```ts
// src/mainview/providerModelCatalogState.ts
export function getProviderModelHelperText(catalog: ProviderModelCatalog): string | undefined {
  if (catalog.hasAttemptedDiscovery && catalog.models.length === 0) {
    return "Provider did not report models during ACP session setup.";
  }

  return undefined;
}
```

```md
<!-- README.md -->

### Model picker behavior

- The picker always includes **Default model**.
- The app shows additional models when the provider reports them during ACP session setup.
- Discovery happens when draft mode prepares or switches a provider, and resumed sessions may refresh the same catalog through ACP `session/load`.
- If a provider does not advertise models during ACP session setup, the picker stays on **Default model** and chat still works.
```

- [ ] **Step 4: Re-run the focused UI tests and the full test suite**

Run: `bunx vitest run tests/ui/App.test.tsx tests/ui/providerModelCatalogState.test.ts && bun run test`  
Expected: PASS. Draft mode now hydrates catalogs before first send, the helper text is accurate, and the full suite still passes.

- [ ] **Step 5: Commit the UI and docs update**

```bash
git add src/mainview/App.tsx src/mainview/providerModelCatalogState.ts tests/ui/App.test.tsx tests/ui/providerModelCatalogState.test.ts README.md
git commit -m "feat: hydrate provider models in draft mode"
```

---

### Task 5: Clean up adapter mapping after ACP schema alignment

**Files:**

- Modify: `src/core/adapters/ClaudeCodeAdapter.ts`
- Modify: `src/core/adapters/CodexAdapter.ts`
- Modify: `src/core/adapters/OpenCodeAdapter.ts`
- Test: `tests/adapters/ClaudeCodeAdapter.test.ts`
- Test: `tests/adapters/CodexAdapter.test.ts`
- Test: `tests/adapters/OpenCodeAdapter.test.ts`

- [ ] **Step 1: Update the adapter tests to the new initialize contract**

```ts
// tests/adapters/CodexAdapter.test.ts
it("initialize() maps ACP capability response into normalized capabilities", async () => {
  const fakeClient = new FakeACPClient({
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: true,
      sessionCapabilities: {
        list: {},
        fork: {},
      },
    },
    authMethods: [{ type: "terminal" }, { type: "oauth" }],
    _meta: {
      models: [
        {
          id: "codex-mini",
          title: "Codex Mini",
          contextWindowTokens: 128000,
        },
      ],
    },
  });
  const adapter = new CodexAdapter(fakeClient);

  const capabilities = await adapter.initialize();

  expect(capabilities).toEqual({
    loadSession: true,
    authMethods: ["terminal", "oauth"],
    supportsTerminalAuth: true,
    session: {
      list: true,
      fork: true,
      resume: false,
      setModel: false,
      stop: false,
    },
    models: [
      {
        id: "codex-mini",
        title: "Codex Mini",
        contextWindowTokens: 128000,
      },
    ],
  });
});
```

```ts
// tests/adapters/ClaudeCodeAdapter.test.ts
expect(capabilities.session).toEqual({
  list: true,
  fork: false,
  resume: true,
  setModel: false,
  stop: false,
});
```

```ts
// tests/adapters/OpenCodeAdapter.test.ts
expect(capabilities.session).toEqual({
  list: true,
  fork: true,
  resume: false,
  setModel: false,
  stop: false,
});
```

- [ ] **Step 2: Run the focused adapter tests**

Run: `bunx vitest run tests/adapters/ClaudeCodeAdapter.test.ts tests/adapters/CodexAdapter.test.ts tests/adapters/OpenCodeAdapter.test.ts`  
Expected: FAIL because the adapters still read `sessionCapabilities.setModel` and still duplicate their initialize-model normalization logic.

- [ ] **Step 3: Reuse the shared initialize normalizer and hardcode `setModel: false`**

```ts
// src/core/adapters/CodexAdapter.ts
import { normalizeProviderModelOptions } from "../../shared/providerModels.ts";

private mapInitializeResultToCapabilities(
  result: ACPInitializeResult
): NormalizedAgentCapabilities {
  const sessionCapabilities = result.agentCapabilities.sessionCapabilities;
  const modelMetadata = normalizeProviderModelOptions(result._meta?.models);

  return {
    loadSession: Boolean(result.agentCapabilities.loadSession),
    authMethods: (result.authMethods ?? []).map((method) => method.type),
    supportsTerminalAuth: (result.authMethods ?? []).some(
      (method) => method.type === "terminal"
    ),
    session: {
      list: Boolean(sessionCapabilities?.list),
      fork: Boolean(sessionCapabilities?.fork),
      resume: Boolean(sessionCapabilities?.resume),
      setModel: false,
      stop: false
    },
    models: modelMetadata
  };
}
```

```ts
// src/core/adapters/ClaudeCodeAdapter.ts
import { normalizeProviderModelOptions } from "../../shared/providerModels.ts";

private mapInitializeResultToCapabilities(
  result: ACPInitializeResult
): NormalizedAgentCapabilities {
  const sessionCapabilities = result.agentCapabilities.sessionCapabilities;
  const modelMetadata = normalizeProviderModelOptions(result._meta?.models);

  return {
    loadSession: Boolean(result.agentCapabilities.loadSession),
    authMethods: (result.authMethods ?? []).map((method) => method.type),
    supportsTerminalAuth: (result.authMethods ?? []).some(
      (method) => method.type === "terminal"
    ),
    session: {
      list: Boolean(sessionCapabilities?.list),
      fork: Boolean(sessionCapabilities?.fork),
      resume: Boolean(sessionCapabilities?.resume),
      setModel: false,
      stop: false
    },
    models: modelMetadata
  };
}
```

```ts
// src/core/adapters/OpenCodeAdapter.ts
import { normalizeProviderModelOptions } from "../../shared/providerModels.ts";

private mapInitializeResultToCapabilities(
  result: ACPInitializeResult
): NormalizedAgentCapabilities {
  const sessionCapabilities = result.agentCapabilities.sessionCapabilities;
  const modelMetadata = normalizeProviderModelOptions(result._meta?.models);

  return {
    loadSession: Boolean(result.agentCapabilities.loadSession),
    authMethods: (result.authMethods ?? []).map((method) => method.type),
    supportsTerminalAuth: (result.authMethods ?? []).some(
      (method) => method.type === "terminal"
    ),
    session: {
      list: Boolean(sessionCapabilities?.list),
      fork: Boolean(sessionCapabilities?.fork),
      resume: Boolean(sessionCapabilities?.resume),
      setModel: false,
      stop: false
    },
    models: modelMetadata
  };
}
```

Delete each adapter’s private `extractModelMetadata()` method after the shared helper is imported so the initialize-metadata mapping lives in one place.

- [ ] **Step 4: Re-run the adapter tests and the full typecheck**

Run: `bunx vitest run tests/adapters/ClaudeCodeAdapter.test.ts tests/adapters/CodexAdapter.test.ts tests/adapters/OpenCodeAdapter.test.ts && bun run typecheck`  
Expected: PASS. Adapter capabilities no longer depend on a stale initialize-only `setModel` signal, and initialize metadata normalization is centralized.

- [ ] **Step 5: Commit the adapter cleanup**

```bash
git add src/core/adapters/ClaudeCodeAdapter.ts src/core/adapters/CodexAdapter.ts src/core/adapters/OpenCodeAdapter.ts tests/adapters/ClaudeCodeAdapter.test.ts tests/adapters/CodexAdapter.test.ts tests/adapters/OpenCodeAdapter.test.ts
git commit -m "refactor: align adapters with ACP model discovery"
```

---

## Final Verification Pass

- [ ] Run: `bun run typecheck`
- [ ] Run: `bun run test`
- [ ] Run: `bun run build`
- [ ] Confirm `README.md` matches the actual runtime behavior.
- [ ] Confirm the model picker still always shows **Default model** when discovery is empty or unavailable.

## Spec Coverage Check

- **ACP schema alignment:** Task 1
- **Shared normalization from session models / config options:** Task 2
- **Runtime-owned session-backed discovery:** Task 3
- **Draft-mode accurate picker + helper text + docs:** Task 4
- **Capability-handling cleanup for stale initialize assumptions:** Task 5

No approved spec section is left without a task.
