# Window Layout Persistence

- Implemented hidden Bun-side persistence for native window frame restore under the app-private data root.
- Kept `src/mainview/state/uiStore.ts` on Zustand, but moved restart persistence to explicit Bun-backed hydrate/save hooks instead of renderer `localStorage` middleware.
- Added focused shared and Bun tests for layout normalization and hidden state-file persistence.
