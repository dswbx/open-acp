# Left Sidebar macOS Blur

## What Changed

- Vendored the native macOS window effects bridge from `mayfer/electrobun-macos-native-blur` default branch at `a431718f56dc53aea6abaf1bf7ed0f104c495fea`.
- Added a Bun FFI wrapper that applies native vibrancy and restores the window shadow on macOS.
- Enabled transparent Electrobun windows on macOS and left non-macOS behavior unchanged.
- Added native effect build wiring for dev, start, canary, and stable packaging flows.
- Made the main app root transparent, kept the center/header/right surfaces opaque, and changed the left session sidebar to translucent shadcn sidebar tokens.
- Removed the app-level duplicate `startWindowMove` call from the header. Electrobun's drag-region preload already starts window movement for `electrobun-webkit-app-region-drag`; the app still sends a global stop fallback on mouseup.
- Added a native `refreshWindowVibrancy` entrypoint and call it from Electrobun `move` events to force the visual effect view to re-display while the window moves.
- Temporarily increased the visibility of the effect for diagnosis, then restored readable sidebar settings after confirming the overlay path tracks live background changes.
- Switched the diagnostic native effect from a full-window view behind the WebView to a left-sidebar-sized native overlay above the WebView with hit-testing disabled. The overlay width is synced from the existing UI layout state.
- Added a native `NSWindow` move/resize observer with a short 60 Hz AppKit run-loop refresh timer while the window is moving. This tests whether the stale backdrop is caused by Electrobun's JS-driven move event arriving too late or too sparsely.
- Added a tiny native geometry pulse during vibrancy refresh because real window resizing updates the backdrop while same-frame redraws do not. The pulse immediately restores the original sidebar width.
- Added a narrow 10 px native drag strip across the top of the chat header, offset after the left sidebar, to test AppKit-native `performWindowDragWithEvent` movement without covering header controls.

## Decisions

- Used the vendor source directly as requested, despite the referenced repo not including a license file.
- Did not adopt the vendor repo's traffic-light repositioning. The native drag strip is intentionally narrow and diagnostic; the existing Electrobun header drag region remains in place for the rest of the header.
- Kept `src/bun/libMacWindowEffects.dylib` as a generated artifact and ignored it in git.
- Kept titlebar drag on Electrobun's built-in drag-region support rather than adding a native overlay, because a rectangular native overlay would intercept existing header controls.
- The native sidebar vibrancy overlay is diagnostic and may tint content because it sits above the WebView. If it fixes live background tracking, the durable version should decide whether the overlay styling is acceptable or whether the sidebar content needs a native/container split.

## Current Effect Settings

- Native material is `NSVisualEffectMaterialHUDWindow` on macOS 10.14+ because `NSVisualEffectMaterialUnderWindowBackground` did not live-update while the window moved.
- Fallback material is `NSVisualEffectMaterialSidebar`.
- Native overlay alpha is `0.16` because the overlay sits above the WebView during this diagnostic path.
- Sidebar overlay is `bg-sidebar/70`.

## Verification

- `bun run build:native-effects`
- `bun run typecheck`
- `bun run test -- tests/ui/App.test.tsx tests/ui/SessionListPanel.test.tsx tests/release/packageScripts.test.ts tests/bun/uiLayoutStateStore.test.ts`
- `bun run build:ui`
