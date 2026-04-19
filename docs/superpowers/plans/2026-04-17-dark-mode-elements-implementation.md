# Dark Mode + Elements Incremental Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add system-aware dark mode with manual override in `src/mainview` and incrementally migrate chat transcript rendering to AI Elements while preserving existing bridge/runtime behavior.

**Architecture:** Keep `App.tsx` as the stateful orchestrator for smoke bridge events and request lifecycle. Add a small, testable theme domain module plus a `ChatSurface` view component that maps existing `ChatMessage` state to AI Elements conversation/message primitives. Update panel/button classes to semantic token-based styles so light/dark both render consistently.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + AI Elements + Vitest

---

## File Structure and Responsibilities

- **Create:** `src/mainview/theme/themePreference.ts` — theme preference parsing, resolution, persistence helpers.
- **Create:** `src/mainview/chat/types.ts` — `ChatMessage` and related chat UI types moved out of `App.tsx`.
- **Create:** `src/mainview/chat/chatSurfaceModel.ts` — pure mapper from `ChatMessage` to chat-render model.
- **Create:** `src/mainview/components/ChatSurface.tsx` — AI Elements chat transcript renderer with streaming/error presentation.
- **Modify:** `src/mainview/App.tsx` — wire theme lifecycle + toggle + `ChatSurface`.
- **Modify:** `src/mainview/styles.css` — Streamdown source + semantic utility refinements for dark mode.
- **Modify:** `src/ui/components/SessionListPanel.tsx` — semantic token classes.
- **Modify:** `src/ui/components/InspectorPanel.tsx` — semantic token classes.
- **Modify:** `src/ui/components/ui/PrimaryButton.tsx` — semantic token classes.
- **Modify:** `tsconfig.ui.json` — `@/*` path alias for generated shadcn/AI Elements imports.
- **Modify:** `vite.config.ts` — runtime alias resolution for `@`.
- **Modify:** `vitest.config.ts` — test alias resolution for `@`.
- **Modify:** `tests/ui/App.test.tsx` — updated assertions for new UI controls.
- **Create:** `tests/ui/themePreference.test.ts` — unit tests for theme logic.
- **Create:** `tests/ui/chatSurfaceModel.test.ts` — unit tests for chat surface mapping.
- **Create:** `tests/ui/ChatSurface.test.tsx` — static render checks for AI Elements chat surface.
- **Modify:** `README.md` — note dark mode + Elements-backed transcript in mainview.

---

### Task 1: Build and test theme preference domain

**Files:**

- Create: `src/mainview/theme/themePreference.ts`
- Test: `tests/ui/themePreference.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveThemeMode,
  type ThemeMode,
  type ThemePreference,
} from "../../src/mainview/theme/themePreference.ts";

describe("themePreference", () => {
  it("parses persisted values with safe fallback", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("bad-value")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("resolves effective mode from preference and system state", () => {
    expect(resolveThemeMode("light", true)).toBe<ThemeMode>("light");
    expect(resolveThemeMode("dark", false)).toBe<ThemeMode>("dark");
    expect(resolveThemeMode("system", true)).toBe<ThemeMode>("dark");
    expect(resolveThemeMode("system", false)).toBe<ThemeMode>("light");
  });

  it("exposes the expected storage key", () => {
    const key: string = THEME_STORAGE_KEY;
    expect(key).toBe("agent-orchestrator-theme-preference");
  });

  it("keeps preference type closed", () => {
    const values: ThemePreference[] = ["light", "dark", "system"];
    expect(values).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/themePreference.test.ts`  
Expected: FAIL with module-not-found for `themePreference.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ThemePreference = "light" | "dark" | "system";
export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "agent-orchestrator-theme-preference";

const isThemePreference = (value: string): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

export const parseThemePreference = (value: string | null | undefined): ThemePreference => {
  if (!value) {
    return "system";
  }
  return isThemePreference(value) ? value : "system";
};

export const resolveThemeMode = (
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ThemeMode => {
  if (preference === "light") {
    return "light";
  }
  if (preference === "dark") {
    return "dark";
  }
  return systemPrefersDark ? "dark" : "light";
};

export const readStoredThemePreference = (): ThemePreference =>
  parseThemePreference(globalThis.localStorage?.getItem(THEME_STORAGE_KEY));

export const writeStoredThemePreference = (preference: ThemePreference): void => {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, preference);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/themePreference.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/ui/themePreference.test.ts src/mainview/theme/themePreference.ts
git commit -m "test+feat: add theme preference domain module"
```

---

### Task 2: Add chat surface model + AI Elements renderer

**Files:**

- Create: `src/mainview/chat/types.ts`
- Create: `src/mainview/chat/chatSurfaceModel.ts`
- Create: `src/mainview/components/ChatSurface.tsx`
- Modify: `src/mainview/styles.css`
- Modify: `tsconfig.ui.json`
- Modify: `vite.config.ts`
- Modify: `vitest.config.ts`
- Test: `tests/ui/chatSurfaceModel.test.ts`
- Test: `tests/ui/ChatSurface.test.tsx`

- [ ] **Step 1: Write failing tests**

```ts
// tests/ui/chatSurfaceModel.test.ts
import { describe, expect, it } from "vitest";
import {
  mapChatMessagesToSurface,
  toChatSurfaceItem,
} from "../../src/mainview/chat/chatSurfaceModel.ts";
import type { ChatMessage } from "../../src/mainview/chat/types.ts";

const base: ChatMessage = {
  id: "m-1",
  author: "assistant",
  provider: "codex",
  text: "",
  timestamp: "2026-04-17T00:00:00.000Z",
  status: "streaming",
};

describe("chatSurfaceModel", () => {
  it("maps empty streaming content to placeholder text", () => {
    expect(toChatSurfaceItem(base).text).toBe("Streaming...");
  });

  it("marks error rows", () => {
    const item = toChatSurfaceItem({ ...base, status: "error", text: "boom" });
    expect(item.isError).toBe(true);
    expect(item.isStreaming).toBe(false);
  });

  it("maps arrays while preserving id order", () => {
    const items = mapChatMessagesToSurface([
      { ...base, id: "1", text: "a", status: "complete" },
      { ...base, id: "2", text: "b", status: "complete" },
    ]);
    expect(items.map((item) => item.id)).toEqual(["1", "2"]);
  });
});
```

```tsx
// tests/ui/ChatSurface.test.tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatSurface } from "../../src/mainview/components/ChatSurface.tsx";
import type { ChatMessage } from "../../src/mainview/chat/types.ts";

const messages: ChatMessage[] = [
  {
    id: "u1",
    author: "user",
    provider: "codex",
    text: "hello",
    timestamp: "2026-04-17T00:00:00.000Z",
    status: "complete",
  },
  {
    id: "a1",
    author: "assistant",
    provider: "codex",
    text: "",
    timestamp: "2026-04-17T00:00:01.000Z",
    status: "streaming",
  },
];

describe("ChatSurface", () => {
  it("renders message text and streaming placeholder", () => {
    const html = renderToStaticMarkup(<ChatSurface messages={messages} />);
    expect(html).toContain("hello");
    expect(html).toContain("Streaming...");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/chatSurfaceModel.test.ts tests/ui/ChatSurface.test.tsx`  
Expected: FAIL with module-not-found for chat model/component files.

- [ ] **Step 3: Implement chat types/model/component and alias prerequisites**

```ts
// src/mainview/chat/types.ts
import type { SmokeProvider } from "../../shared/AppRPC.ts";

export type ChatAuthor = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  requestId?: string;
  author: ChatAuthor;
  provider: SmokeProvider;
  model?: string;
  text: string;
  timestamp: string;
  status?: "streaming" | "complete" | "error";
}
```

```ts
// src/mainview/chat/chatSurfaceModel.ts
import type { ChatMessage } from "./types.ts";

export interface ChatSurfaceItem {
  id: string;
  from: "user" | "assistant" | "system";
  authorLabel: string;
  providerLabel: string;
  model?: string;
  text: string;
  isStreaming: boolean;
  isError: boolean;
}

export const toChatSurfaceItem = (message: ChatMessage): ChatSurfaceItem => ({
  id: message.id,
  from: message.author,
  authorLabel: message.author,
  providerLabel: message.provider,
  model: message.model,
  text: message.status === "streaming" && message.text.length === 0 ? "Streaming..." : message.text,
  isStreaming: message.status === "streaming",
  isError: message.status === "error",
});

export const mapChatMessagesToSurface = (messages: readonly ChatMessage[]): ChatSurfaceItem[] =>
  messages.map(toChatSurfaceItem);
```

```tsx
// src/mainview/components/ChatSurface.tsx
import React from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation.tsx";
import { Message, MessageContent, MessageResponse } from "../../components/ai-elements/message.tsx";
import { Spinner } from "../../components/ui/spinner.tsx";
import { mapChatMessagesToSurface } from "../chat/chatSurfaceModel.ts";
import type { ChatMessage } from "../chat/types.ts";

interface ChatSurfaceProps {
  messages: readonly ChatMessage[];
}

export const ChatSurface = ({ messages }: ChatSurfaceProps): React.ReactNode => {
  const items = mapChatMessagesToSurface(messages);

  return (
    <Conversation className="mb-3 h-[26rem] rounded-md border border-border bg-muted/40">
      <ConversationContent className="gap-4 p-3">
        {items.length === 0 ? (
          <ConversationEmptyState
            description="Send a message to begin."
            title="No chat messages yet"
          />
        ) : (
          items.map((item) => (
            <Message from={item.from} key={item.id}>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium uppercase">{item.authorLabel}</span>
                <span>·</span>
                <span className="uppercase">{item.providerLabel}</span>
                {item.model ? (
                  <>
                    <span>·</span>
                    <span>{item.model}</span>
                  </>
                ) : null}
                {item.isStreaming ? <span>· Streaming</span> : null}
              </div>
              <MessageContent className={item.isError ? "text-destructive" : undefined}>
                {item.isStreaming && item.text === "Streaming..." ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Spinner className="size-3" />
                    Streaming...
                  </span>
                ) : (
                  <MessageResponse>{item.text}</MessageResponse>
                )}
              </MessageContent>
            </Message>
          ))
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
};
```

```css
/* src/mainview/styles.css */
@source "../../node_modules/streamdown/dist/*.js";
```

```json
// tsconfig.ui.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "rootDir": "src",
    "outDir": "dist-ui",
    "types": ["node", "react", "react-dom"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": [
    "src/mainview/**/*.ts",
    "src/mainview/**/*.tsx",
    "src/ui/**/*.ts",
    "src/ui/**/*.tsx",
    "src/shared/**/*.ts"
  ]
}
```

```ts
// vite.config.ts
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

```ts
// vitest.config.ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/chatSurfaceModel.test.ts tests/ui/ChatSurface.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  tests/ui/chatSurfaceModel.test.ts \
  tests/ui/ChatSurface.test.tsx \
  src/mainview/chat/types.ts \
  src/mainview/chat/chatSurfaceModel.ts \
  src/mainview/components/ChatSurface.tsx \
  src/mainview/styles.css \
  tsconfig.ui.json \
  vite.config.ts \
  vitest.config.ts
git commit -m "feat: add ai-elements chat surface and mapping model"
```

---

### Task 3: Integrate theme lifecycle + chat surface in App

**Files:**

- Modify: `src/mainview/App.tsx`
- Test: `tests/ui/App.test.tsx`

- [ ] **Step 1: Extend App test with expected new controls (failing first)**

```ts
// tests/ui/App.test.tsx (replace test body)
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/mainview/App.tsx";

describe("App UI shell", () => {
  it("renders orchestrator header, chat, and theme controls", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Agent Orchestrator");
    expect(html).toContain("Sessions");
    expect(html).toContain("Chat");
    expect(html).toContain("Default model");
    expect(html).toContain("Session inspector");
    expect(html).toContain("Runtime events");
    expect(html).toContain("Theme");
    expect(html).toContain("System");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/App.test.tsx`  
Expected: FAIL because `Theme` control does not exist yet.

- [ ] **Step 3: Implement App integration**

```tsx
// src/mainview/App.tsx (key additions)
import { ChatSurface } from "./components/ChatSurface.tsx";
import {
  parseThemePreference,
  resolveThemeMode,
  readStoredThemePreference,
  writeStoredThemePreference,
  type ThemeMode,
  type ThemePreference
} from "./theme/themePreference.ts";
import type { ChatMessage } from "./chat/types.ts";

interface AppState {
  sessions: SessionListItem[];
  chatMessages: ChatMessage[];
  chatInput: string;
  selectedModels: Record<SmokeProvider, string>;
  isSending: boolean;
  activeRequestId?: string;
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  logs: SmokeLogLine[];
  themePreference: ThemePreference;
  themeMode: ThemeMode;
}

private systemThemeQuery?: MediaQueryList;
private readonly handleSystemThemeChange = (): void => {
  if (this.state.themePreference !== "system") return;
  const mode = resolveThemeMode("system", this.systemThemeQuery?.matches ?? false);
  this.applyThemeMode(mode);
};

private applyThemeMode(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
  this.setState({ themeMode: mode });
}

private setThemePreference(nextPreference: ThemePreference): void {
  writeStoredThemePreference(nextPreference);
  const mode = resolveThemeMode(
    nextPreference,
    this.systemThemeQuery?.matches ?? false
  );
  document.documentElement.classList.toggle("dark", mode === "dark");
  this.setState({
    themePreference: nextPreference,
    themeMode: mode
  });
}

componentDidMount(): void {
  this.unsubscribeBridge = this.smokeBridge.subscribe((event) => {
    this.handleSmokeBridgeEvent(event);
  });
  this.systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  this.systemThemeQuery.addEventListener("change", this.handleSystemThemeChange);
  const storedPreference = parseThemePreference(readStoredThemePreference());
  const storedMode = resolveThemeMode(storedPreference, this.systemThemeQuery.matches);
  document.documentElement.classList.toggle("dark", storedMode === "dark");
  this.setState({
    themePreference: storedPreference,
    themeMode: storedMode
  });
}

componentWillUnmount(): void {
  this.unsubscribeBridge?.();
  this.systemThemeQuery?.removeEventListener("change", this.handleSystemThemeChange);
}
```

```tsx
// src/mainview/App.tsx (render replacements)
<header className="mb-6 flex items-center justify-between gap-4">
  <div>
    <h1 className="text-2xl font-semibold">Agent Orchestrator</h1>
    <p className="mt-1 text-sm text-muted-foreground">
      Electrobun desktop runtime with in-app real agent smoke testing.
    </p>
  </div>
  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
    <span>Theme</span>
    <select
      aria-label="Theme"
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
      onChange={(event) =>
        this.setThemePreference(event.target.value as ThemePreference)
      }
      value={this.state.themePreference}
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>
</header>

<section className="rounded-lg border border-border bg-card p-4 shadow-sm">
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      Chat
    </h2>
    <select
      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
      disabled={Boolean(this.state.activeRequestId)}
      onChange={(event) =>
        this.setState({
          selectedProvider: event.target.value as SmokeProvider
        })
      }
      value={this.state.selectedProvider}
    >
      <option value="codex">Codex</option>
      <option value="claude">Claude</option>
      <option value="opencode">OpenCode</option>
    </select>
    <select
      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
      disabled={Boolean(this.state.activeRequestId) || this.state.isSending}
      onChange={(event) =>
        this.setState((previousState) => ({
          selectedModels: {
            ...previousState.selectedModels,
            [this.state.selectedProvider]: event.target.value
          }
        }))
      }
      value={selectedModel}
    >
      <option value="">Default model</option>
      {modelOptions.map((modelName) => (
        <option key={modelName} value={modelName}>
          {modelName}
        </option>
      ))}
    </select>
  </div>

  <ChatSurface messages={this.state.chatMessages} />

  <label className="mb-2 block text-xs font-medium text-muted-foreground">
    Message for {selectedProviderLabel}
  </label>
  <textarea
    className="mb-3 min-h-20 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
    disabled={Boolean(this.state.activeRequestId) || this.state.isSending}
    onChange={(event) =>
      this.setState({
        chatInput: event.target.value
      })
    }
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
    disabled={Boolean(this.state.activeRequestId) || this.state.isSending}
    label="Send"
    onClick={() => {
      void this.handleSendMessage();
    }}
  />
</section>
```

- [ ] **Step 4: Run updated test to verify it passes**

Run: `npx vitest run tests/ui/App.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mainview/App.tsx tests/ui/App.test.tsx
git commit -m "feat: wire theme lifecycle and ai-elements chat surface into app"
```

---

### Task 4: Tokenize panel/button styles for dark mode parity

**Files:**

- Modify: `src/ui/components/SessionListPanel.tsx`
- Modify: `src/ui/components/InspectorPanel.tsx`
- Modify: `src/ui/components/ui/PrimaryButton.tsx`

- [ ] **Step 1: Write failing test for tokenized class usage**

```ts
// tests/ui/App.test.tsx (append expectation block)
expect(html).toContain("bg-card");
expect(html).toContain("border-border");
expect(html).toContain("text-muted-foreground");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/App.test.tsx`  
Expected: FAIL because shared components still use `zinc-*` classes.

- [ ] **Step 3: Update shared components to semantic tokens**

```tsx
// src/ui/components/SessionListPanel.tsx
import React from "react";
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
}

export class SessionListPanel extends React.Component<SessionListPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions
          </h2>
          <PrimaryButton label="New session" onClick={this.props.onCreateSession} />
        </div>
        <ul className="space-y-3">
          {this.props.sessions.map((session) => (
            <li className="rounded-md border border-border p-3" key={session.id}>
              <div className="text-sm font-medium text-card-foreground">{session.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {session.model} · Context {session.contextWindow}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }
}
```

```tsx
// src/ui/components/InspectorPanel.tsx
import React from "react";
import { PrimaryButton } from "./ui/PrimaryButton.tsx";

interface InspectorPanelProps {
  modelName: string;
  contextWindow: string;
  onStop: () => void;
  onRetry: () => void;
}

export class InspectorPanel extends React.Component<InspectorPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Session inspector
        </h2>
        <dl className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-medium text-card-foreground">{this.props.modelName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Context</dt>
            <dd className="font-medium text-card-foreground">{this.props.contextWindow}</dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <PrimaryButton label="Stop" onClick={this.props.onStop} />
          <PrimaryButton label="Retry" onClick={this.props.onRetry} />
        </div>
      </section>
    );
  }
}
```

```tsx
// src/ui/components/ui/PrimaryButton.tsx
import React from "react";
import { Button } from "@base-ui/react/button";

interface PrimaryButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export class PrimaryButton extends React.Component<PrimaryButtonProps> {
  render(): React.ReactNode {
    return (
      <Button
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
        disabled={this.props.disabled}
        onClick={this.props.onClick}
      >
        {this.props.label}
      </Button>
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/App.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  src/ui/components/SessionListPanel.tsx \
  src/ui/components/InspectorPanel.tsx \
  src/ui/components/ui/PrimaryButton.tsx \
  tests/ui/App.test.tsx
git commit -m "style: switch shared shell components to semantic tokens"
```

---

### Task 5: Documentation + full regression pass

**Files:**

- Modify: `README.md`
- Verify: `tests/ui/*.test.ts*` and full project scripts

- [ ] **Step 1: Update README with implemented behavior**

```md
## UI Notes

- `src/mainview` now supports theme preference (`System`, `Light`, `Dark`) with local persistence.
- Chat transcript rendering in `src/mainview` uses AI Elements conversation/message primitives with streaming placeholders.
```

- [ ] **Step 2: Run focused UI tests**

Run: `npx vitest run tests/ui/themePreference.test.ts tests/ui/chatSurfaceModel.test.ts tests/ui/ChatSurface.test.tsx tests/ui/App.test.tsx`  
Expected: PASS all listed tests.

- [ ] **Step 3: Run full validation commands**

Run: `npm run typecheck && npm test && npm run build`  
Expected: all commands succeed.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document dark mode and ai-elements chat integration"
```

---

## Notes for Implementation

- Keep provider/model selection, send behavior, and stream event handling logic unchanged except for view wiring.
- Do not change `SmokeBridge` interfaces or ACP payload handling.
- Keep `src/ui` app behavior intact; only shared component class tokens should shift.
