# Dark Mode + Elements Incremental Integration Design

## Problem

The main app (`src/mainview`) is currently light-only and uses custom Tailwind markup for chat rendering. We want to add dark mode and improve interaction quality using [elements.ai-sdk.dev](https://elements.ai-sdk.dev/) components without destabilizing existing runtime behavior.

## Scope

- Apply changes to `src/mainview` only.
- Add dark mode with system preference support and manual override.
- Integrate Elements components for chat transcript and streaming presentation in an incremental first pass.
- Allow small UX polish adjustments (spacing, visual hierarchy, message bubbles).

## Out of Scope

- Migrating `src/ui` demo shell in this phase.
- Rewriting bridge/runtime contracts (`SmokeBridge`, ACP event payloads).
- Full chat-surface rewrite to Elements primitives in one pass.

## Goals and Success Criteria

1. Dark mode works with resolution order: user preference (`light` / `dark` / `system`) then OS preference.
2. User preference persists across reloads.
3. Chat rendering in `src/mainview` uses Elements primitives for conversation/message/streaming display.
4. Existing behavior remains intact for provider/model selection, send flow, stream updates, and runtime logs.

## Architecture and Boundaries

The current `App.tsx` remains the orchestration point for state, ACP stream handling, and bridge interaction. We add two focused layers:

1. **Theme layer**
   - Introduce a small theme controller utility/hook that:
     - Reads persisted preference from local storage.
     - Resolves effective theme from preference + `matchMedia`.
     - Applies theme marker (`dark` class or equivalent attribute) at the document root.
   - Expose a compact toggle UI in the main header.

2. **Chat rendering layer**
   - Introduce a `ChatSurface` component in `src/mainview` that receives existing chat state and maps it to Elements-compatible rendering primitives.
   - Keep message and request identifiers unchanged.
   - Keep existing event-driven updates unchanged; only rendering concerns move to the new component.

## Component-Level Design

### New/Updated Units

1. **Theme controller**
   - Encapsulates preference parsing, persistence, system listener, and root class application.
   - Preference values: `light`, `dark`, `system`.
   - Effective mode values: `light` or `dark`.

2. **Header theme control**
   - Small control in `App` header for selecting theme preference.
   - Displays active mode clearly (for example, icon/label reflecting effective mode).

3. **`ChatSurface`**
   - Renders conversation scroll container.
   - Renders user/assistant/system messages with distinct styling.
   - Displays streaming state consistently, including empty-stream placeholder.
   - Keeps error states explicit and visually distinct.

4. **Composer area**
   - Existing textarea/send semantics remain unchanged for this pass.
   - Styling can be adjusted to align with dark-mode tokens and Elements visuals.

5. **Other panels**
   - `SessionListPanel`, `InspectorPanel`, and runtime events panel retain structure.
   - Update classes/tokens for dark compatibility only.

## Data Flow

1. User sends prompt from existing composer flow.
2. `App` appends user message and dispatches bridge request (unchanged).
3. Bridge stream events update `chatMessages` via current handlers (unchanged).
4. `ChatSurface` receives `chatMessages` and renders:
   - role metadata
   - provider/model metadata
   - streamed chunks and completion/error status
5. Theme controller updates root theme class; all panels consume tokenized styles.

## Error Handling and UX Safeguards

- Preserve explicit system/error message insertion behavior.
- Preserve runtime log output behavior.
- Preserve Enter-to-send and Shift+Enter newline behavior.
- Preserve request lockouts during active requests.
- Avoid layout jumps while streaming by keeping stable message blocks and placeholder behavior.
- If a specific Elements render path cannot render a message state, fallback only for that message block (not the entire chat panel).

## Implementation Phasing

1. Add theme preference model, persistence, and root theme application in `src/mainview`.
2. Tokenize key panel/chat colors for both light and dark.
3. Introduce `ChatSurface` and migrate transcript rendering to Elements primitives.
4. Keep composer and bridge/event orchestration as-is.
5. Validate parity for streaming, completion, and error cases.

## Testing Strategy

- Extend/update tests around:
  - theme preference resolution and persistence
  - effective mode behavior under system preference changes
  - chat rendering for user/assistant/system/error/streaming cases
  - unchanged send-disable behavior during active requests
- Keep existing test suite structure and only add focused coverage where behavior changes.

## Risks and Mitigations

- **Risk:** Elements integration introduces message-shape mismatch.
  - **Mitigation:** use explicit pure mapping helpers from current `ChatMessage` to render model.
- **Risk:** Dark mode regressions in non-chat panels.
  - **Mitigation:** define shared panel tokens and apply consistently across panel shells.
- **Risk:** Streaming UX regressions.
  - **Mitigation:** preserve current streaming semantics and placeholders exactly during first pass.
