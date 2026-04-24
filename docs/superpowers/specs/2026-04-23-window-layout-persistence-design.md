# Window And Layout Persistence Design

## Problem

The desktop app currently resets its native window size and position on restart because `src/bun/index.ts` always creates the main window with hard-coded frame values. The mainview layout should also reliably survive restarts for left/right pane sizes and right sidebar visibility.

## Scope

- Persist the native main window frame across restarts.
- Persist global mainview layout state across restarts.
- Keep the implementation aligned with the shipped desktop app surfaces in `src/bun` and `src/mainview`.

## Out of Scope

- Introducing per-workspace layout state.
- Adding user-facing preferences UI.
- Treating transient window geometry as part of user-editable settings.

## Goals And Success Criteria

1. Relaunching the app restores the last non-minimized window size and position.
2. Relaunching the app restores pane widths and right sidebar visibility.
3. Window geometry remains hidden from the user-facing settings surface.
4. Mainview layout state continues to use Zustand for UI code.

## Architecture And Boundaries

The persistence design is intentionally split between native runtime state and renderer UI state.

1. **Native window state**
   - Add a small Bun-side persistence module for app-private window state.
   - Store native frame fields needed before renderer boot: `x`, `y`, `width`, `height`, and maximized state.
   - Read this state before creating `BrowserWindow`.
   - Update it from Bun window lifecycle events such as move, resize, maximize, and unmaximize.
   - Keep this state out of user-editable settings files.

2. **Mainview layout state**
   - Keep `src/mainview/state/uiStore.ts` as the layout state owner.
   - Continue using Zustand persistence for `leftPanelSize`, `rightPanelSize`, and `isRightSidebarOpen`.
   - Treat these values as global app layout preferences, not workspace-scoped state.

## Component-Level Design

### New/Updated Units

1. **Window state store (`src/bun`)**
   - Reads the saved native frame from an app-private JSON file.
   - Writes updated frame state with a small debounce so rapid move/resize events do not thrash disk writes.
   - Exposes validation and fallback behavior for corrupt or partial state.

2. **Main window bootstrap (`src/bun/index.ts`)**
   - Resolves the initial frame from persisted state first, then falls back to the current defaults.
   - Preserves the existing minimum size guard.
   - Tracks the last non-minimized bounds so restored state remains sensible.

3. **UI layout store (`src/mainview/state/uiStore.ts`)**
   - Remains the Zustand-backed source of truth for pane widths and sidebar visibility.
   - No user-facing behavior change beyond restart persistence staying reliable.

## Data Flow

1. App starts.
2. Bun loads saved native window state from the app-private store.
3. `BrowserWindow` is created using saved bounds when available, otherwise current defaults.
4. The mainview loads and hydrates its Zustand UI store for pane widths and sidebar visibility.
5. During runtime, Bun listens for native frame changes and persists them.
6. During runtime, the mainview updates the persisted Zustand layout state when pane sizes or right sidebar visibility change.

## Error Handling And Safeguards

- If the window state file is missing, unreadable, or invalid, use the current default frame.
- Clamp restored width and height to the existing minimum window size.
- Persist only meaningful frame values and avoid saving minimized geometry.
- Keep the implementation global and isolated so it does not interfere with session, workspace, or ACP behavior.

## Testing Strategy

- Add focused unit coverage for native window state validation and persistence helpers if the new Bun store is extracted into a testable module.
- Verify the mainview UI store still persists pane widths and sidebar visibility.
- Run the existing typecheck and test suite.
- Manually verify:
  - resize window, restart, and confirm size is restored
  - move window, restart, and confirm position is restored
  - resize panes, restart, and confirm widths are restored
  - hide/show right sidebar, restart, and confirm visibility is restored

## Risks And Mitigations

- **Risk:** persisted window coordinates become invalid after display changes.
  - **Mitigation:** validate stored frame values and fall back to defaults when invalid.
- **Risk:** repeated move/resize events write too often.
  - **Mitigation:** debounce Bun-side window-state writes.
- **Risk:** UI layout appears persisted in code but not in practice because renderer storage is not durable in this desktop environment.
  - **Mitigation:** verify the existing Zustand persistence path during implementation and switch only the storage backend if needed while keeping Zustand as the UI API.
