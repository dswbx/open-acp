# Native Page Zoom Menu

## Summary

Add native app menu controls for page zoom in the shipped Electrobun desktop app. Use Electrobun `BrowserView.setPageZoom()` / `getPageZoom()` with custom `ApplicationMenu` actions; do not add React UI.

## Key Changes

- Add `View` menu items for `Zoom In`, `Zoom Out`, and `Actual Size` with standard accelerators.
- Keep `Window > Zoom` unchanged for macOS window zoom/maximize.
- Persist a normalized page zoom value under the app private state root and apply it to the main webview at startup.
- Clamp zoom from `0.5` to `2.0`, step by `0.1`, and round to one decimal place.

## Tests

- Add unit tests for normalization, stepping, clamping, and JSON persistence.
- Run `bun run typecheck`.
- Run the focused page zoom store test.

## Assumptions

- Native zoom means webview page zoom for the app UI.
- No visible in-app zoom controls or status text are needed.
- Electrobun page zoom is fully supported on macOS/WebKit; Windows/Linux may follow Electrobun's documented no-op behavior.
