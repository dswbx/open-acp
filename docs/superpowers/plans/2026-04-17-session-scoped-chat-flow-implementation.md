# Session-Scoped Chat Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat strictly session-scoped so no transcript/composer renders without an active session, provider choice only happens before session activation, model choice can change between messages, and the sidebar clearly shows the active session.

**Architecture:** Keep the existing Electrobun bridge and provider model catalog flow, but add an explicit UI draft-mode state in `App.tsx`. In draft mode, the sidebar owns provider/model selection and the primary action creates a session; in active-session mode, the center panel renders the transcript/composer for the selected session, the provider selector locks, and the model helper text explains when ACP returned no model metadata.

**Tech Stack:** TypeScript + React 19 + Electrobun RPC + ACP client + Vitest

---

## File Structure and Responsibilities

- **Modify:** `src/mainview/providerModelCatalogState.ts` — add a pure helper for the “ACP returned no models” sidebar hint.
- **Modify:** `tests/ui/providerModelCatalogState.test.ts` — cover the new helper’s attempted-empty vs pre-discovery behavior.
- **Modify:** `src/ui/components/SessionListPanel.tsx` — move provider/model controls into the sidebar, add draft/active modes, and strengthen active-session button semantics.
- **Modify:** `tests/ui/SessionListPanel.test.tsx` — assert draft controls, provider-lock behavior, and explicit active-row markers.
- **Modify:** `src/mainview/App.tsx` — remove the bootstrap chat message, add `isDraftingSession`, switch the center panel to an empty state when no session is active, and drive sidebar/session behavior.
- **Modify:** `tests/ui/App.test.tsx` — cover draft-mode rendering, draft-to-create flow, active-session provider lock, and unchanged “no prefetch before session” behavior.
- **Modify:** `README.md` — update the manual test instructions to match the new sidebar-first session flow and document the ACP model-list fallback.

### Ambiguity Resolution

The approved spec still contains one conflict: it says the center panel must show **no chat without a session**, but it also mentions **first send creates the session**. This plan resolves that conflict explicitly:

1. **No session selected** means the app is in **draft mode**.
2. In draft mode, the sidebar primary action label is **Create session**.
3. Clicking **Create session** calls the existing `createChatSession` bridge method and activates the returned session.
4. Only after that activation does the chat transcript/composer render.
5. When a session is active, the sidebar primary action switches back to **New session** and returns the app to draft mode without immediately creating anything.

This keeps the UI coherent without adding a modal or changing bridge contracts.

---

### Task 1: Add the ACP empty-model helper

**Files:**

- Modify: `src/mainview/providerModelCatalogState.ts`
- Test: `tests/ui/providerModelCatalogState.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from "vitest";
import {
  createInitialProviderModelCatalogs,
  getProviderModelHelperText,
  getProviderModelOptions,
  getSelectedModelValue,
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

  it("explains attempted discovery when ACP returns no models", () => {
    expect(
      getProviderModelHelperText({
        provider: "claude",
        models: [],
        hasAttemptedDiscovery: true,
        source: "empty",
      }),
    ).toBe("Provider did not report models via ACP.");
  });

  it("stays quiet before discovery has been attempted", () => {
    expect(
      getProviderModelHelperText({
        provider: "claude",
        models: [],
        hasAttemptedDiscovery: false,
        source: "empty",
      }),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the focused helper test**

Run: `npx vitest run tests/ui/providerModelCatalogState.test.ts`  
Expected: FAIL with `getProviderModelHelperText` missing from `providerModelCatalogState.ts`.

- [ ] **Step 3: Add the minimal helper**

```ts
// src/mainview/providerModelCatalogState.ts
import {
  createEmptyProviderModelCatalog,
  type ProviderModelCatalog,
  type ProviderModelOption,
  type SmokeProvider,
} from "../shared/providerModels.ts";

export function createInitialProviderModelCatalogs(): Record<SmokeProvider, ProviderModelCatalog> {
  return {
    codex: createEmptyProviderModelCatalog("codex"),
    claude: createEmptyProviderModelCatalog("claude"),
    opencode: createEmptyProviderModelCatalog("opencode"),
  };
}

export function getSelectedModelValue(
  selectedModel: string,
  catalog: ProviderModelCatalog,
): string {
  const normalizedModel = selectedModel.trim();
  if (normalizedModel.length === 0) {
    return "";
  }

  return catalog.models.some((model) => model.id === normalizedModel) ? normalizedModel : "";
}

export function getProviderModelOptions(catalog: ProviderModelCatalog): ProviderModelOption[] {
  return catalog.models;
}

export function getProviderModelHelperText(catalog: ProviderModelCatalog): string | undefined {
  if (catalog.hasAttemptedDiscovery && catalog.models.length === 0) {
    return "Provider did not report models via ACP.";
  }

  return undefined;
}
```

- [ ] **Step 4: Re-run the helper test**

Run: `npx vitest run tests/ui/providerModelCatalogState.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the helper**

```bash
git add src/mainview/providerModelCatalogState.ts tests/ui/providerModelCatalogState.test.ts
git commit -m "test: cover ACP empty model hint"
```

---

### Task 2: Add sidebar draft-mode coverage

**Files:**

- Modify: `tests/ui/SessionListPanel.test.tsx`
- Modify later: `src/ui/components/SessionListPanel.tsx`

- [ ] **Step 1: Rewrite the sidebar tests around the new contract**

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionListPanel } from "../../src/ui/components/SessionListPanel.tsx";

describe("SessionListPanel", () => {
  it("renders draft controls and helper text when no session is active", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId={undefined}
        isDraftingSession={true}
        modelHelperText="Provider did not report models via ACP."
        modelOptions={[{ id: "claude-sonnet-4.6", contextWindowTokens: null }]}
        onCreateSession={() => {}}
        onSelectModel={() => {}}
        onSelectProvider={() => {}}
        onSelectSession={() => {}}
        selectedModel=""
        selectedProvider="claude"
        sessions={[]}
      />,
    );

    expect(html).toContain("Create session");
    expect(html).toContain('aria-label="Provider"');
    expect(html).toContain('aria-label="Model"');
    expect(html).toContain("Provider did not report models via ACP.");
    expect(html).toContain("No sessions yet. Create one to start.");
  });

  it("marks the active row and locks provider selection for active sessions", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s2"
        isDraftingSession={false}
        modelOptions={[{ id: "claude-sonnet-4.6", contextWindowTokens: null }]}
        onCreateSession={() => {}}
        onSelectModel={() => {}}
        onSelectProvider={() => {}}
        onSelectSession={() => {}}
        selectedModel=""
        selectedProvider="claude"
        sessions={[
          {
            id: "s1",
            title: "Session 1",
            model: "default",
            contextWindow: "live session",
          },
          {
            id: "s2",
            title: "Session 2",
            model: "claude-sonnet-4.6",
            contextWindow: "live session",
          },
        ]}
      />,
    );

    expect(html).toContain("New session");
    expect(html).toContain('data-session-id="s2"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-provider-locked="true"');
  });
});
```

- [ ] **Step 2: Run the sidebar test to capture the contract mismatch**

Run: `npx vitest run tests/ui/SessionListPanel.test.tsx`  
Expected: FAIL with missing props such as `isDraftingSession`, `selectedProvider`, or `modelOptions`.

- [ ] **Step 3: Confirm the new prop contract in the component before implementation**

```ts
// src/ui/components/SessionListPanel.tsx
import type { ProviderModelOption, SmokeProvider } from "../../shared/AppRPC.ts";

interface SessionListPanelProps {
  sessions: SessionListItem[];
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onSelectProvider: (provider: SmokeProvider) => void;
  onSelectModel: (model: string) => void;
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  selectedModel: string;
  modelOptions: ProviderModelOption[];
  modelHelperText?: string;
  isDraftingSession: boolean;
  disabled?: boolean;
}
```

- [ ] **Step 4: Re-run the sidebar test and keep it failing**

Run: `npx vitest run tests/ui/SessionListPanel.test.tsx`  
Expected: FAIL until Task 3 adds the matching JSX implementation.

- [ ] **Step 5: Commit the failing sidebar coverage**

```bash
git add tests/ui/SessionListPanel.test.tsx
git commit -m "test: cover sidebar draft session flow"
```

---

### Task 3: Implement the sidebar draft/create UI

**Files:**

- Modify: `src/ui/components/SessionListPanel.tsx`
- Test: `tests/ui/SessionListPanel.test.tsx`

- [ ] **Step 1: Implement the new sidebar structure**

```tsx
import React from "react";
import type { ProviderModelOption, SmokeProvider } from "../../shared/AppRPC.ts";
import { PrimaryButton } from "./ui/PrimaryButton.tsx";

export interface SessionListItem {
  id: string;
  title: string;
  model: string;
  contextWindow: string;
}

interface SessionListPanelProps {
  sessions: SessionListItem[];
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onSelectProvider: (provider: SmokeProvider) => void;
  onSelectModel: (model: string) => void;
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  selectedModel: string;
  modelOptions: ProviderModelOption[];
  modelHelperText?: string;
  isDraftingSession: boolean;
  disabled?: boolean;
}

export class SessionListPanel extends React.Component<SessionListPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions
          </h2>
          <PrimaryButton
            label={this.props.isDraftingSession ? "Create session" : "New session"}
            onClick={this.props.onCreateSession}
            disabled={this.props.disabled}
          />
        </div>

        <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Provider
            <select
              aria-label="Provider"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              data-provider-locked={this.props.isDraftingSession ? "false" : "true"}
              disabled={this.props.disabled || !this.props.isDraftingSession}
              onChange={(event) => this.props.onSelectProvider(event.target.value as SmokeProvider)}
              value={this.props.selectedProvider}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="opencode">OpenCode</option>
            </select>
          </label>

          <label className="block text-xs font-medium text-muted-foreground">
            Model
            <select
              aria-label="Model"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              disabled={this.props.disabled}
              onChange={(event) => this.props.onSelectModel(event.target.value)}
              value={this.props.selectedModel}
            >
              <option value="">Default model</option>
              {this.props.modelOptions.map((modelOption) => (
                <option key={modelOption.id} value={modelOption.id}>
                  {modelOption.title ?? modelOption.id}
                </option>
              ))}
            </select>
          </label>

          {this.props.modelHelperText ? (
            <p className="text-xs text-muted-foreground">{this.props.modelHelperText}</p>
          ) : null}
        </div>

        <ul className="space-y-3">
          {this.props.sessions.length === 0 ? (
            <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No sessions yet. Create one to start.
            </li>
          ) : (
            this.props.sessions.map((session) => {
              const isActive = this.props.activeSessionId === session.id;
              return (
                <li key={session.id}>
                  <button
                    aria-current={isActive ? "page" : undefined}
                    aria-pressed={isActive}
                    className={`w-full rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isActive
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:bg-muted/60"
                    }`}
                    data-active={isActive ? "true" : "false"}
                    data-session-id={session.id}
                    disabled={this.props.disabled}
                    onClick={() => {
                      this.props.onSelectSession(session.id);
                    }}
                    type="button"
                  >
                    <div className="text-sm font-medium text-card-foreground">{session.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {session.model} · Context {session.contextWindow}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>
    );
  }
}
```

- [ ] **Step 2: Run the sidebar test and verify it passes**

Run: `npx vitest run tests/ui/SessionListPanel.test.tsx`  
Expected: PASS.

- [ ] **Step 3: Run the model helper test to catch any type regressions**

Run: `npx vitest run tests/ui/providerModelCatalogState.test.ts tests/ui/SessionListPanel.test.tsx`  
Expected: PASS.

- [ ] **Step 4: Check the diff before moving into `App.tsx`**

Run: `git --no-pager diff -- src/ui/components/SessionListPanel.tsx tests/ui/SessionListPanel.test.tsx`  
Expected: diff shows only sidebar contract and active-state changes.

- [ ] **Step 5: Commit the sidebar implementation**

```bash
git add src/ui/components/SessionListPanel.tsx tests/ui/SessionListPanel.test.tsx
git commit -m "feat: add session draft controls to sidebar"
```

---

### Task 4: Add App-level regression coverage for session-scoped chat

**Files:**

- Modify: `tests/ui/App.test.tsx`
- Modify later: `src/mainview/App.tsx`

- [ ] **Step 1: Expand the recording bridge so tests can observe create-session calls**

```ts
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
```

- [ ] **Step 2: Replace the shell assertions with session-scoped ones**

```tsx
describe("App UI shell", () => {
  it("renders the sidebar draft flow instead of chat when no session exists", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Agent Orchestrator");
    expect(html).toContain("Sessions");
    expect(html).toContain("Create session");
    expect(html).toContain("Create or select a session to start chatting.");
    expect(html).not.toContain("No chat messages yet");
    expect(html).not.toContain("Type a prompt and press Enter to send.");
    expect(html).toContain("Session inspector");
    expect(html).toContain("Runtime events");
  });

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

  it("does not fetch provider models when switching providers before a session exists", () => {
    const bridge = new RecordingSmokeBridge();
    const app = new App({ smokeBridge: bridge }) as App & {
      handleSelectProvider(provider: "codex" | "claude" | "opencode"): void;
    };

    app.setState = ((updater: any) => {
      const nextState = typeof updater === "function" ? updater(app.state, app.props) : updater;
      app.state = {
        ...app.state,
        ...nextState,
      };
    }) as typeof app.setState;

    app.handleSelectProvider("claude");

    expect(app.state.selectedProvider).toBe("claude");
    expect(bridge.modelCatalogRequests).toEqual([]);
  });
});
```

- [ ] **Step 3: Add draft-to-active flow coverage**

```tsx
it("switches from an active session back to draft mode before creating another session", async () => {
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

  app.state = {
    ...app.state,
    isDraftingSession: false,
    activeSessionId: "session-codex",
    selectedProvider: "codex",
    sessions: [
      {
        id: "session-codex",
        provider: "codex",
        title: "Codex session-c",
        model: "default",
        contextWindow: "live session",
      },
    ],
  };

  await app.handleCreateSession();

  expect(app.state.isDraftingSession).toBe(true);
  expect(app.state.activeSessionId).toBeUndefined();
  expect(bridge.createSessionCalls).toEqual([]);
});

it("creates a session from draft mode using the selected provider and hydrates models", async () => {
  const bridge = new RecordingSmokeBridge();
  const app = new App({ smokeBridge: bridge }) as App & {
    handleCreateSession(): Promise<void>;
    handleSelectProvider(provider: "codex" | "claude" | "opencode"): void;
  };

  app.setState = ((updater: any) => {
    const nextState = typeof updater === "function" ? updater(app.state, app.props) : updater;
    app.state = {
      ...app.state,
      ...nextState,
    };
  }) as typeof app.setState;

  app.handleSelectProvider("claude");
  await app.handleCreateSession();

  expect(bridge.createSessionCalls).toEqual(["claude"]);
  expect(app.state.isDraftingSession).toBe(false);
  expect(app.state.activeSessionId).toBe("session-claude");
  expect(app.state.selectedProvider).toBe("claude");
  expect(bridge.modelCatalogRequests).toEqual(["claude"]);
});

it("locks provider changes for the active session while keeping model selection visible", () => {
  const app = new App({ smokeBridge: new RecordingSmokeBridge() });

  app.state = {
    ...app.state,
    isDraftingSession: false,
    activeSessionId: "session-claude",
    selectedProvider: "claude",
    sessions: [
      {
        id: "session-claude",
        provider: "claude",
        title: "Claude session-c",
        model: "default",
        contextWindow: "live session",
      },
    ],
  };

  const html = renderToStaticMarkup(app.render() as React.ReactElement);

  expect(html).toContain('data-provider-locked="true"');
  expect(html).toContain('aria-label="Model"');
  expect(html).toContain("Message for Claude");
  expect(html).toContain("Send");
});
```

- [ ] **Step 4: Run the App test to capture the current mismatch**

Run: `npx vitest run tests/ui/App.test.tsx`  
Expected: FAIL because `App.tsx` still renders chat before a session exists and does not track `isDraftingSession`.

- [ ] **Step 5: Commit the failing App coverage**

```bash
git add tests/ui/App.test.tsx
git commit -m "test: cover session scoped chat shell"
```

---

### Task 5: Implement session-scoped chat, draft mode, and docs

**Files:**

- Modify: `src/mainview/App.tsx`
- Modify: `README.md`
- Test: `tests/ui/App.test.tsx`

- [ ] **Step 1: Add explicit draft mode to `AppState` and remove the bootstrapped chat message**

```ts
interface AppState {
  sessions: ChatSession[];
  chatMessages: ChatMessage[];
  chatInput: string;
  providerModelCatalogs: Record<SmokeProvider, ProviderModelCatalog>;
  selectedModels: Record<SmokeProvider, string>;
  isSending: boolean;
  isCreatingSession: boolean;
  isDraftingSession: boolean;
  activeRequestId?: string;
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  logs: SmokeLogLine[];
  themePreference: ThemePreference;
  themeMode: ThemeMode;
}

this.state = {
  sessions: [],
  chatMessages: [],
  chatInput: "",
  providerModelCatalogs: createInitialProviderModelCatalogs(),
  selectedModels: {
    codex: "",
    claude: "",
    opencode: "",
  },
  isSending: false,
  isCreatingSession: false,
  isDraftingSession: true,
  selectedProvider: "codex",
  logs: [],
  themePreference: "system",
  themeMode: "light",
};
```

- [ ] **Step 2: Make `handleCreateSession` a two-stage draft/create action and keep no-session errors out of the transcript**

```ts
private readonly handleCreateSession = async (): Promise<void> => {
  if (this.state.activeRequestId || this.state.isSending || this.state.isCreatingSession) {
    return;
  }

  if (!this.state.isDraftingSession) {
    this.setState({
      activeSessionId: undefined,
      chatInput: "",
      isDraftingSession: true
    });
    return;
  }

  const provider = this.state.selectedProvider;
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
      selectedProvider: created.provider,
      activeSessionId: created.sessionId,
      sessions: this.upsertSession(
        previousState.sessions,
        this.createSessionListItem(created.provider, created.sessionId)
      )
    }));
    void this.hydrateProviderModelCatalog(created.provider);
    this.appendLog({
      provider: created.provider,
      level: "info",
      message: `Created session ${created.sessionId.slice(0, 8)}.`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    this.setState({
      isCreatingSession: false,
      isDraftingSession: true
    });
    this.appendLog({
      provider,
      level: "error",
      message: error instanceof Error ? error.message : "Failed to create session.",
      timestamp: new Date().toISOString()
    });
  }
};
```

- [ ] **Step 3: Make the render path session-scoped and move provider/model controls into the sidebar**

```tsx
import {
  createInitialProviderModelCatalogs,
  getProviderModelHelperText,
  getProviderModelOptions,
  getSelectedModelValue
} from "./providerModelCatalogState.ts";

render(): React.ReactNode {
  const selectedProvider = this.state.selectedProvider;
  const selectedCatalog = this.state.providerModelCatalogs[selectedProvider];
  const selectedModel = getSelectedModelValue(
    this.state.selectedModels[selectedProvider],
    selectedCatalog
  );
  const modelOptions = getProviderModelOptions(selectedCatalog);
  const modelHelperText = getProviderModelHelperText(selectedCatalog);
  const selectedProviderLabel = getProviderLabel(selectedProvider);
  const activeSession = this.state.sessions.find(
    (session) => session.id === this.state.activeSessionId
  );
  const hasActiveSession = Boolean(activeSession) && !this.state.isDraftingSession;
  const visibleMessages = hasActiveSession
    ? this.state.chatMessages.filter(
        (message) => message.sessionId === this.state.activeSessionId
      )
    : [];

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <header className="mb-6 flex items-center justify-between gap-4">
        {/* existing title + theme select */}
      </header>

      <section className="grid gap-4 lg:grid-cols-[280px_1fr_320px]">
        <SessionListPanel
          activeSessionId={hasActiveSession ? this.state.activeSessionId : undefined}
          disabled={
            Boolean(this.state.activeRequestId) ||
            this.state.isSending ||
            this.state.isCreatingSession
          }
          isDraftingSession={this.state.isDraftingSession}
          modelHelperText={modelHelperText}
          modelOptions={modelOptions}
          onCreateSession={this.handleCreateSession}
          onSelectModel={(model) =>
            this.setState((previousState) => ({
              selectedModels: {
                ...previousState.selectedModels,
                [selectedProvider]: model
              }
            }))
          }
          onSelectProvider={this.handleSelectProvider}
          onSelectSession={this.handleSelectSession}
          selectedModel={selectedModel}
          selectedProvider={selectedProvider}
          sessions={this.state.sessions}
        />

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Chat
            </h2>
          </div>

          {!hasActiveSession ? (
            <div className="flex h-[26rem] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              Create or select a session to start chatting.
            </div>
          ) : (
            <>
              <ChatSurface messages={visibleMessages} />

              <label className="mb-2 block text-xs font-medium text-muted-foreground">
                Message for {selectedProviderLabel}
              </label>

              <div className="flex items-end gap-3">
                <textarea
                  className="min-h-20 flex-1 rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
                  disabled={
                    Boolean(this.state.activeRequestId) ||
                    this.state.isSending ||
                    this.state.isCreatingSession
                  }
                  onChange={(event) => {
                    this.setState({
                      chatInput: event.target.value
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void this.handleSendMessage();
                    }
                  }}
                  placeholder="Type a prompt and press Enter to send."
                  value={this.state.chatInput}
                />

                <PrimaryButton
                  disabled={
                    Boolean(this.state.activeRequestId) ||
                    this.state.isSending ||
                    this.state.isCreatingSession
                  }
                  label="Send"
                  onClick={() => {
                    void this.handleSendMessage();
                  }}
                />
              </div>
            </>
          )}
        </section>

        {/* existing inspector + runtime events panels */}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Update the README to match the new flow**

```md
### How to test

1. Start the app with Electrobun (`npm run app:start` or `npm run app:dev:hmr`).
2. In the left **Sessions** panel, choose the provider for the next session.
3. Click **Create session**.
4. After the session becomes active, optionally change the model in the sidebar.
5. Enter a message in the center **Chat** panel and click **Send** (or press Enter).
6. To prepare a different session, click **New session** to return to draft mode.

### Model picker behavior

- The picker always includes **Default model**.
- The app only shows additional models when the provider reports them through ACP metadata.
- If a provider does not advertise models, the UI explains that ACP returned no model list and chat still works with **Default model**.
```

- [ ] **Step 5: Run validation and commit**

Run: `npx vitest run tests/ui/providerModelCatalogState.test.ts tests/ui/SessionListPanel.test.tsx tests/ui/App.test.tsx && npm run test && npm run typecheck`  
Expected: all targeted UI tests pass, then the full test suite and typecheck pass.

```bash
git add src/mainview/App.tsx src/mainview/providerModelCatalogState.ts src/ui/components/SessionListPanel.tsx tests/ui/App.test.tsx tests/ui/SessionListPanel.test.tsx tests/ui/providerModelCatalogState.test.ts README.md
git commit -m "feat: make chat session scoped"
```
