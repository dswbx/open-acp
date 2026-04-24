# Window Layout Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the main window frame, pane widths, and right-sidebar visibility across app restarts without putting transient window geometry into user-facing settings.

**Architecture:** Add a hidden Bun-managed persistence layer under the app-private data directory for native window bounds and mainview layout state. Keep the renderer layout API in Zustand, but hydrate and save that Zustand state through typed Electrobun RPC instead of relying on renderer `localStorage`.

**Tech Stack:** TypeScript + React 19 + Zustand + Electrobun RPC + Bun filesystem APIs + Vitest

---

## File Structure and Responsibilities

- **Create:** `src/shared/uiLayoutState.ts` — shared layout defaults, persisted-layout types, and normalization helpers for both Bun and mainview.
- **Modify:** `src/shared/AppRPC.ts` — add typed RPC request/response contracts for reading and writing persisted UI layout state.
- **Create:** `src/bun/appPrivateStatePaths.ts` — app-private hidden file locations under the Electrobun app data root.
- **Create:** `src/bun/windowStateStore.ts` — Bun-side main-window frame reader/writer with validation and debounced persistence.
- **Create:** `src/bun/uiLayoutStateStore.ts` — Bun-side persisted layout reader/writer for mainview pane/sidebar state.
- **Modify:** `src/bun/rpcHandlers.ts` — serve `getUILayoutState` and `setUILayoutState`.
- **Modify:** `src/bun/index.ts` — restore the saved frame before creating `BrowserWindow`, then persist move/resize/maximize changes.
- **Modify:** `src/mainview/bridge/SmokeBridge.ts` — extend the bridge interface with persisted layout methods.
- **Modify:** `src/mainview/bridge/ElectrobunSmokeBridge.ts` — wire the new layout RPC calls.
- **Modify:** `src/mainview/state/uiStore.ts` — keep Zustand state/actions but replace `persist(localStorage)` with Bun-backed hydrate/save helpers.
- **Modify:** `src/mainview/components/ResizableMainLayout.tsx` — reuse shared layout defaults so runtime/UI normalization stay aligned.
- **Modify:** `src/mainview/main.tsx` — hydrate layout state before mounting React and subscribe it for persistence when Electrobun is available.
- **Create:** `tests/shared/uiLayoutState.test.ts` — unit tests for shared layout normalization.
- **Create:** `tests/bun/windowStateStore.test.ts` — unit tests for hidden window-state restore and persistence behavior.
- **Create:** `tests/bun/uiLayoutStateStore.test.ts` — unit tests for Bun-side layout read/write behavior.

---

### Task 1: Add shared layout state primitives

**Files:**

- Create: `src/shared/uiLayoutState.ts`
- Modify: `src/shared/AppRPC.ts`
- Test: `tests/shared/uiLayoutState.test.ts`

- [ ] **Step 1: Write the shared layout normalization test**

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEFT_PANEL_SIZE,
  DEFAULT_RIGHT_PANEL_SIZE,
  LEFT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  normalizeUILayoutState,
} from "../../src/shared/uiLayoutState.ts";

describe("uiLayoutState", () => {
  it("falls back to defaults and clamps invalid persisted sizes", () => {
    expect(
      normalizeUILayoutState({
        isRightSidebarOpen: "yes",
        leftPanelSize: 10,
        rightPanelSize: 120,
      }),
    ).toEqual({
      isRightSidebarOpen: true,
      leftPanelSize: LEFT_PANEL_MIN_WIDTH,
      rightPanelSize: RIGHT_PANEL_MIN_WIDTH,
    });
  });

  it("keeps valid persisted values", () => {
    expect(
      normalizeUILayoutState({
        isRightSidebarOpen: false,
        leftPanelSize: 320,
        rightPanelSize: 420,
      }),
    ).toEqual({
      isRightSidebarOpen: false,
      leftPanelSize: 320,
      rightPanelSize: 420,
    });
  });

  it("uses the documented defaults when state is absent", () => {
    expect(normalizeUILayoutState(undefined)).toEqual({
      isRightSidebarOpen: true,
      leftPanelSize: DEFAULT_LEFT_PANEL_SIZE,
      rightPanelSize: DEFAULT_RIGHT_PANEL_SIZE,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the helper is missing**

Run: `bunx vitest run tests/shared/uiLayoutState.test.ts`
Expected: FAIL with module-not-found for `src/shared/uiLayoutState.ts`.

- [ ] **Step 3: Implement shared defaults, types, and RPC contracts**

```ts
// src/shared/uiLayoutState.ts
export const DEFAULT_LEFT_PANEL_SIZE = 280;
export const DEFAULT_RIGHT_PANEL_SIZE = 320;
export const LEFT_PANEL_MIN_WIDTH = 250;
export const RIGHT_PANEL_MIN_WIDTH = 300;

export interface PersistedUILayoutState {
  isRightSidebarOpen: boolean;
  leftPanelSize: number;
  rightPanelSize: number;
}

export function normalizeUILayoutState(state: unknown): PersistedUILayoutState {
  const candidate = state as Partial<PersistedUILayoutState> | undefined;

  return {
    isRightSidebarOpen:
      typeof candidate?.isRightSidebarOpen === "boolean" ? candidate.isRightSidebarOpen : true,
    leftPanelSize:
      typeof candidate?.leftPanelSize === "number"
        ? Math.max(candidate.leftPanelSize, LEFT_PANEL_MIN_WIDTH)
        : DEFAULT_LEFT_PANEL_SIZE,
    rightPanelSize:
      typeof candidate?.rightPanelSize === "number"
        ? Math.max(candidate.rightPanelSize, RIGHT_PANEL_MIN_WIDTH)
        : DEFAULT_RIGHT_PANEL_SIZE,
  };
}
```

```ts
// src/shared/AppRPC.ts
import type { PersistedUILayoutState } from "./uiLayoutState.ts";

export interface GetUILayoutStateResult {
  state: PersistedUILayoutState;
}

export interface SetUILayoutStateParams {
  state: PersistedUILayoutState;
}

export interface SetUILayoutStateResult {
  state: PersistedUILayoutState;
}
```

- [ ] **Step 4: Re-run the shared layout test**

Run: `bunx vitest run tests/shared/uiLayoutState.test.ts`
Expected: PASS.

---

### Task 2: Add the hidden Bun-side stores

**Files:**

- Create: `src/bun/appPrivateStatePaths.ts`
- Create: `src/bun/windowStateStore.ts`
- Create: `src/bun/uiLayoutStateStore.ts`
- Test: `tests/bun/windowStateStore.test.ts`
- Test: `tests/bun/uiLayoutStateStore.test.ts`

- [ ] **Step 1: Write failing Bun persistence tests**

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWindowStateStore,
  type PersistedWindowState,
} from "../../src/bun/windowStateStore.ts";
import { createUILayoutStateStore } from "../../src/bun/uiLayoutStateStore.ts";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("windowStateStore", () => {
  it("reads a saved frame and clamps width/height to the minimum", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-window-state-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "window-state.json");

    await Bun.write(
      filePath,
      JSON.stringify({
        x: 12,
        y: 18,
        width: 200,
        height: 300,
        isMaximized: true,
      } satisfies PersistedWindowState),
    );

    const store = createWindowStateStore({ filePath, minWidth: 800, minHeight: 600 });

    expect(store.read()).toEqual({
      x: 12,
      y: 18,
      width: 800,
      height: 600,
      isMaximized: true,
    });
  });
});

describe("uiLayoutStateStore", () => {
  it("writes normalized layout state to the hidden file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-layout-state-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "layout-state.json");
    const store = createUILayoutStateStore({ filePath });

    await store.write({ isRightSidebarOpen: false, leftPanelSize: 320, rightPanelSize: 420 });

    await expect(readFile(filePath, "utf8")).resolves.toContain('"leftPanelSize":320');
    await expect(store.read()).resolves.toEqual({
      isRightSidebarOpen: false,
      leftPanelSize: 320,
      rightPanelSize: 420,
    });
  });
});
```

- [ ] **Step 2: Run the Bun persistence tests and confirm the new stores are missing**

Run: `bunx vitest run tests/bun/windowStateStore.test.ts tests/bun/uiLayoutStateStore.test.ts`
Expected: FAIL with module-not-found for the new Bun store files.

- [ ] **Step 3: Implement hidden app-private state stores**

```ts
// src/bun/appPrivateStatePaths.ts
import path from "node:path";
import { Utils } from "electrobun/bun";

const APP_PRIVATE_STATE_ROOT = path.join(Utils.paths.appData, "open-acp");

export const getWindowStatePath = () => path.join(APP_PRIVATE_STATE_ROOT, "window-state.json");
export const getUILayoutStatePath = () => path.join(APP_PRIVATE_STATE_ROOT, "layout-state.json");
```

```ts
// src/bun/windowStateStore.ts
export interface PersistedWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export function createWindowStateStore(options: {
  filePath: string;
  minWidth: number;
  minHeight: number;
}) {
  // synchronous startup read + debounced async write helpers
}
```

```ts
// src/bun/uiLayoutStateStore.ts
import { normalizeUILayoutState, type PersistedUILayoutState } from "../shared/uiLayoutState.ts";

export function createUILayoutStateStore(options: { filePath: string }) {
  return {
    async read(): Promise<PersistedUILayoutState> {
      // read JSON or fallback to normalizeUILayoutState(undefined)
    },
    async write(state: PersistedUILayoutState): Promise<void> {
      // mkdir + write normalized JSON
    },
  };
}
```

- [ ] **Step 4: Re-run the Bun persistence tests**

Run: `bunx vitest run tests/bun/windowStateStore.test.ts tests/bun/uiLayoutStateStore.test.ts`
Expected: PASS.

---

### Task 3: Wire Bun startup, runtime persistence, and typed RPC

**Files:**

- Modify: `src/bun/index.ts`
- Modify: `src/bun/rpcHandlers.ts`
- Modify: `src/shared/AppRPC.ts`
- Modify: `src/mainview/bridge/SmokeBridge.ts`
- Modify: `src/mainview/bridge/ElectrobunSmokeBridge.ts`

- [ ] **Step 1: Extend RPC and the bridge with layout-state methods**

```ts
// src/shared/AppRPC.ts
getUILayoutState: {
  params: Record<string, never>;
  response: GetUILayoutStateResult;
}
setUILayoutState: {
  params: SetUILayoutStateParams;
  response: SetUILayoutStateResult;
}
```

```ts
// src/mainview/bridge/SmokeBridge.ts
getUILayoutState(): Promise<GetUILayoutStateResult>;
setUILayoutState(state: PersistedUILayoutState): Promise<SetUILayoutStateResult>;
```

- [ ] **Step 2: Implement Bun request handlers**

```ts
// src/bun/rpcHandlers.ts
getUILayoutState: async () => ({
  state: await deps.uiLayoutStateStore.read(),
}),
setUILayoutState: async ({ state }) => {
  await deps.uiLayoutStateStore.write(state);
  return { state: await deps.uiLayoutStateStore.read() };
},
```

- [ ] **Step 3: Restore and persist the native main window frame**

```ts
// src/bun/index.ts
const initialWindowState = windowStateStore.read();

const mainWindow = new BrowserWindow({
  frame: initialWindowState
    ? {
        width: initialWindowState.width,
        height: initialWindowState.height,
        x: initialWindowState.x,
        y: initialWindowState.y,
      }
    : DEFAULT_MAIN_WINDOW_FRAME,
});

if (initialWindowState?.isMaximized) {
  mainWindow.maximize();
}

mainWindow.on("move", () => windowStateStore.scheduleSave(readCurrentWindowState(mainWindow)));
mainWindow.on("resize", () => windowStateStore.scheduleSave(readCurrentWindowState(mainWindow)));
mainWindow.on("maximize", () => windowStateStore.scheduleSave(readCurrentWindowState(mainWindow)));
mainWindow.on("unmaximize", () =>
  windowStateStore.scheduleSave(readCurrentWindowState(mainWindow)),
);
```

- [ ] **Step 4: Run focused Bun and bridge regression tests**

Run: `bunx vitest run tests/bun/windowStateStore.test.ts tests/bun/uiLayoutStateStore.test.ts tests/bun/providerModelCatalogStore.test.ts`
Expected: PASS.

---

### Task 4: Keep the renderer store on Zustand while moving persistence to Bun

**Files:**

- Modify: `src/mainview/state/uiStore.ts`
- Modify: `src/mainview/components/ResizableMainLayout.tsx`
- Modify: `src/mainview/main.tsx`

- [ ] **Step 1: Replace `persist(localStorage)` with explicit hydrate/save helpers**

```ts
// src/mainview/state/uiStore.ts
export const useUIStore = create<UIState>((set) => ({
  ...normalizeUILayoutState(undefined),
  setRightSidebarOpen: (open) => set({ isRightSidebarOpen: open }),
  toggleRightSidebar: () => set((state) => ({ isRightSidebarOpen: !state.isRightSidebarOpen })),
  setPanelSizes: ({ left, right }) =>
    set({
      leftPanelSize: Math.max(left, LEFT_PANEL_MIN_WIDTH),
      rightPanelSize: Math.max(right, RIGHT_PANEL_MIN_WIDTH),
    }),
}));

export async function hydrateUILayoutFromBridge(bridge: Pick<SmokeBridge, "getUILayoutState">) {
  const { state } = await bridge.getUILayoutState();
  useUIStore.setState(normalizeUILayoutState(state));
}

export function startUILayoutPersistence(bridge: Pick<SmokeBridge, "setUILayoutState">) {
  return useUIStore.subscribe((state) => {
    void bridge.setUILayoutState({
      isRightSidebarOpen: state.isRightSidebarOpen,
      leftPanelSize: state.leftPanelSize,
      rightPanelSize: state.rightPanelSize,
    });
  });
}
```

- [ ] **Step 2: Hydrate before React render and subscribe after hydration**

```ts
// src/mainview/main.tsx
async function bootstrap() {
  const smokeBridge = scopedWindow.__electrobun ? new ElectrobunSmokeBridge() : undefined;

  if (smokeBridge?.isAvailable()) {
    await hydrateUILayoutFromBridge(smokeBridge);
    startUILayoutPersistence(smokeBridge);
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App smokeBridge={smokeBridge} />
    </React.StrictMode>,
  );
}

void bootstrap();
```

- [ ] **Step 3: Reuse the shared defaults in the resizable layout**

```ts
// src/mainview/components/ResizableMainLayout.tsx
import {
  DEFAULT_LEFT_PANEL_SIZE,
  DEFAULT_RIGHT_PANEL_SIZE,
  LEFT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
} from "../../shared/uiLayoutState.ts";
```

- [ ] **Step 4: Run UI-focused tests and typecheck**

Run: `bunx vitest run tests/shared/uiLayoutState.test.ts tests/ui/rootIndex.test.ts tests/ui/themePreference.test.ts`
Expected: PASS.

Run: `bun run typecheck`
Expected: PASS.

---

### Task 5: Final verification and task log

**Files:**

- Create: `docs/tasks/2026-04-23-window-layout-persistence.md`

- [ ] **Step 1: Record the implementation session**

```md
# Window Layout Persistence

- Implemented hidden Bun-side persistence for native window frame restore.
- Moved mainview pane/sidebar persistence from renderer `localStorage` to Bun-backed state while keeping Zustand as the UI store API.
- Verified focused tests and typecheck results.
```

- [ ] **Step 2: Run the main regression suite**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 3: Manual desktop verification**

Run: `bun run dev`
Expected:

- resizing and restarting restores the window frame
- moving and restarting restores the window position
- changing pane widths survives restart
- toggling the right sidebar survives restart
