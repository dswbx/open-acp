# Provider Draft Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the provider dropdown until the sidebar enters explicit draft mode, including the zero-session startup state, while preserving the existing session-scoped chat and model-picker behavior.

**Architecture:** Keep the current `App.tsx` state model (`isDraftingSession`, `draftProvider`, `selectedProvider`) and change only when the sidebar starts in browse mode and when `SessionListPanel` renders provider controls. The provider picker becomes a draft-only UI element; `New session` transitions into draft mode, `Create session` uses the selected draft provider, and selecting any existing session returns the sidebar to browse mode.

**Tech Stack:** TypeScript, React 19 class components, Vitest, Vite, Electrobun

---

## File Structure and Responsibilities

- **Modify:** `src/mainview/App.tsx` — start the app in browse mode when there are no sessions yet, and keep the existing draft transition methods driving the sidebar mode.
- **Modify:** `src/ui/components/SessionListPanel.tsx` — render the provider dropdown only in draft mode and update the zero-session helper copy.
- **Modify:** `tests/ui/App.test.tsx` — cover zero-session browse mode, first-click transition into draft mode, and draft cancellation by selecting an existing session.
- **Modify:** `tests/ui/SessionListPanel.test.tsx` — cover hidden provider controls in browse mode, visible provider controls in draft mode, and unchanged active-session highlighting.
- **Modify:** `README.md` — update the manual testing flow so the provider picker appears only after clicking **New session**.

### Ambiguity Resolution

The approved spec chooses one consistent rule for every state, including first-run:

1. The app starts in **browse mode**, even when there are zero sessions.
2. The provider dropdown is **hidden** in browse mode.
3. Clicking **New session** is required before the provider dropdown appears.
4. The button label flips to **Create session** only after entering draft mode.

This resolves the previous confusion where the provider control was technically disabled but still visible.

---

### Task 1: Move the sidebar from always-visible provider controls to draft-only controls

**Files:**
- Modify: `tests/ui/SessionListPanel.test.tsx`
- Modify: `tests/ui/App.test.tsx`
- Modify: `src/ui/components/SessionListPanel.tsx`
- Modify: `src/mainview/App.tsx`

- [ ] **Step 1: Write the failing browse-mode and draft-mode regressions**

```ts
// tests/ui/SessionListPanel.test.tsx
describe("SessionListPanel", () => {
  it("hides the provider picker in browse mode when there are no sessions yet", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId={undefined}
        isDraftingSession={false}
        onCreateSession={() => {}}
        onSelectProvider={() => {}}
        onSelectSession={() => {}}
        selectedProvider="claude"
        sessions={[]}
      />
    );

    expect(html).toContain("New session");
    expect(html).not.toContain('aria-label="Provider"');
    expect(html).toContain("No sessions yet. Click New session to start.");
  });

  it("shows the provider picker only in draft mode", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId={undefined}
        isDraftingSession={true}
        onCreateSession={() => {}}
        onSelectProvider={() => {}}
        onSelectSession={() => {}}
        selectedProvider="claude"
        sessions={[]}
      />
    );

    expect(html).toContain("Create session");
    expect(html).toContain('aria-label="Provider"');
  });

  it("keeps the active row highlighted without rendering provider controls in browse mode", () => {
    const html = renderToStaticMarkup(
      <SessionListPanel
        activeSessionId="s2"
        isDraftingSession={false}
        onCreateSession={() => {}}
        onSelectProvider={() => {}}
        onSelectSession={() => {}}
        selectedProvider="claude"
        sessions={[
          {
            id: "s1",
            title: "Session 1",
            model: "default",
            contextWindow: "live session"
          },
          {
            id: "s2",
            title: "Session 2",
            model: "claude-sonnet-4.6",
            contextWindow: "live session"
          }
        ]}
      />
    );

    expect(html).toContain("New session");
    expect(html).not.toContain('aria-label="Provider"');
    expect(html).toContain('data-session-id="s2"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-current="page"');
  });
});

// tests/ui/App.test.tsx
it("renders the sidebar browse flow instead of draft controls when no session exists", () => {
  const html = renderToStaticMarkup(<App />);

  expect(html).toContain("Agent Orchestrator");
  expect(html).toContain("Sessions");
  expect(html).toContain("New session");
  expect(html).toContain("No sessions yet. Click New session to start.");
  expect(html).toContain("Create or select a session to start chatting.");
  expect(html).not.toContain("Create session");
  expect(html).not.toContain('aria-label="Provider"');
  expect(html).not.toContain('aria-label="Model"');
  expect(html).not.toContain("Type a prompt and press Enter to send.");
});

it("enters draft mode before creating the first session", async () => {
  const bridge = new RecordingSmokeBridge();
  const app = new App({ smokeBridge: bridge }) as App & {
    handleCreateSession(): Promise<void>;
  };

  app.setState = ((updater: any) => {
    const nextState =
      typeof updater === "function" ? updater(app.state, app.props) : updater;
    app.state = {
      ...app.state,
      ...nextState
    };
  }) as typeof app.setState;

  await app.handleCreateSession();

  expect(app.state.isDraftingSession).toBe(true);
  expect(app.state.activeSessionId).toBeUndefined();
  expect(bridge.createSessionCalls).toEqual([]);
});

it("cancels draft mode when selecting an existing session", () => {
  const bridge = new RecordingSmokeBridge();
  const app = new App({ smokeBridge: bridge }) as App & {
    handleSelectSession(sessionId: string): void;
  };

  app.setState = ((updater: any) => {
    const nextState =
      typeof updater === "function" ? updater(app.state, app.props) : updater;
    app.state = {
      ...app.state,
      ...nextState
    };
  }) as typeof app.setState;

  app.state = {
    ...app.state,
    isDraftingSession: true,
    draftProvider: "claude",
    sessions: [
      {
        id: "session-claude",
        provider: "claude",
        title: "Claude session-c",
        model: "default",
        contextWindow: "live session"
      }
    ]
  };

  app.handleSelectSession("session-claude");

  expect(app.state.isDraftingSession).toBe(false);
  expect(app.state.activeSessionId).toBe("session-claude");
  expect(app.state.selectedProvider).toBe("claude");
});
```

- [ ] **Step 2: Run the focused UI tests to verify they fail**

Run: `npx vitest run tests/ui/SessionListPanel.test.tsx tests/ui/App.test.tsx`  
Expected: FAIL because the app still boots with `isDraftingSession: true`, the zero-session render still shows `Create session`, and `SessionListPanel` still renders the provider `<select>` even when not drafting.

- [ ] **Step 3: Apply the minimal browse-mode and draft-only rendering changes**

```ts
// src/mainview/App.tsx (constructor state)
this.state = {
  sessions: [],
  chatMessages: [],
  chatInput: "",
  draftProvider: "codex",
  providerModelCatalogs: createInitialProviderModelCatalogs(),
  selectedModels: {
    codex: "",
    claude: "",
    opencode: ""
  },
  isSending: false,
  isCreatingSession: false,
  isDraftingSession: false,
  selectedProvider: "codex",
  logs: [],
  themePreference: "system",
  themeMode: "light"
};

// src/ui/components/SessionListPanel.tsx
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

        {this.props.isDraftingSession ? (
          <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <label className="block text-xs font-medium text-muted-foreground">
              Provider
              <select
                aria-label="Provider"
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
                data-provider-locked="false"
                disabled={this.props.disabled}
                onChange={(event) =>
                  this.props.onSelectProvider(event.target.value as SmokeProvider)
                }
                value={this.props.selectedProvider}
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
                <option value="opencode">OpenCode</option>
              </select>
            </label>
          </div>
        ) : null}

        <ul className="space-y-3">
          {this.props.sessions.length === 0 ? (
            <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No sessions yet. Click New session to start.
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
                    <div className="text-sm font-medium text-card-foreground">
                      {session.title}
                    </div>
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

- [ ] **Step 4: Re-run the focused UI tests to verify the new browse/draft behavior passes**

Run: `npx vitest run tests/ui/SessionListPanel.test.tsx tests/ui/App.test.tsx`  
Expected: PASS with the zero-session shell showing **New session**, the provider dropdown hidden in browse mode, visible in draft mode, and the state tests confirming draft entry/cancellation.

- [ ] **Step 5: Commit the behavior change**

```bash
git add src/mainview/App.tsx src/ui/components/SessionListPanel.tsx tests/ui/App.test.tsx tests/ui/SessionListPanel.test.tsx
git commit -m "fix: hide provider picker outside draft mode"
```

---

### Task 2: Update the manual test flow and run full validation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README flow to match browse mode -> draft mode**

```md
### How to test

1. Start the app with Electrobun (`npm run app:start` or `npm run app:dev:hmr`).
2. In the left **Sessions** panel, click **New session**.
3. Choose the provider that appears in draft mode.
4. Click **Create session**.
5. After the session becomes active, optionally change the model below the message box in the center **Chat** panel.
6. Enter a message in the center **Chat** panel and click **Send** (or press Enter).
7. To prepare a different session, click **New session** again to return to draft mode.
8. The assistant response streams directly into the same chat thread, and streaming state is shown inline on the assistant message.
9. Optional runtime logs remain visible in the right panel.

- The provider picker is only shown while the sidebar is in draft mode.
```

- [ ] **Step 2: Run the full repository checks**

Run: `npm test && npm run typecheck && npm run build`  
Expected: PASS, with only the existing Vite chunk-size warnings during `npm run build`.

- [ ] **Step 3: Commit the documentation update**

```bash
git add README.md
git commit -m "docs: update draft session creation steps"
```
