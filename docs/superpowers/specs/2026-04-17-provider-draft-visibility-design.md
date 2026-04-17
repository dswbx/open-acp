# Provider Draft Visibility Design

## Problem

The current session sidebar always shows the provider dropdown. Even though it becomes editable only after clicking **New session**, that state change is not obvious enough, so the UI feels like provider selection is mysteriously locked after the first use.

## Goals

- Make it visually obvious when provider selection is available.
- Remove the misleading always-visible provider dropdown from non-draft states.
- Keep the current session-scoped chat flow and provider locking rules intact.
- Preserve the model selector behavior in the active chat composer.

## Non-Goals

- Changing runtime session semantics or introducing a new session-creation backend flow.
- Reworking model selection behavior.
- Adding new sidebar modes beyond the existing browse/draft distinction.

## Chosen Approach

Hide the provider dropdown unless the app is in explicit **draft mode**.

- In **browse mode**, the sidebar shows only the session action button and the session list.
- Clicking **New session** enters **draft mode**.
- In **draft mode**, the button changes to **Create session** and the provider dropdown appears directly under it.
- After creating a session, or after selecting an existing one, the app exits draft mode and hides the provider dropdown again.

This is the simplest and most stable option because it applies one rule everywhere: **provider controls are only visible while creating a session**.

## UI Behavior

### Browse mode

- Button label: **New session**
- Provider dropdown: **hidden**
- Session list remains visible
- Active session button remains visually highlighted
- Chat panel behavior stays unchanged from the existing session-scoped design

### Draft mode

- Button label: **Create session**
- Provider dropdown: **visible**
- Provider selection remains enabled unless request/session creation lockouts are active
- Session list can still be shown so the user can cancel draft mode by selecting an existing session

### Zero-session state

Use the same browse-mode rule even when there are no sessions yet.

- Initial button label: **New session**
- Provider dropdown: **hidden**
- Empty-state helper text in the sidebar becomes: **"No sessions yet. Click New session to start."**

This keeps the first-run flow consistent with the rest of the app instead of adding a special case.

## State Model

No new state concepts are needed.

- `isDraftingSession` continues to decide whether the sidebar is in browse mode or draft mode.
- `draftProvider` continues to store the provider choice while drafting a new session.
- `selectedProvider` continues to represent the active session provider.

The change is only in rendering and copy:

- `isDraftingSession === false` -> hide provider controls
- `isDraftingSession === true` -> show provider controls

## Interaction Flow

1. App starts in **browse mode**.
2. User clicks **New session**.
3. App enters **draft mode** and reveals the provider dropdown.
4. User chooses a provider and clicks **Create session**.
5. App creates the session, activates it, returns to **browse mode**, and hides the provider dropdown again.
6. If the user selects an existing session while drafting, draft mode is cancelled and the provider dropdown hides immediately.

## Error Handling

- If session creation fails, stay in **draft mode** so the provider choice remains visible and retryable.
- If the app is temporarily locked by an active request or session creation, keep the existing disabled behavior for the draft controls.
- Do not show a disabled provider dropdown in browse mode; it should be absent, not merely non-interactive.

## Testing

Update sidebar and app coverage to assert:

1. browse mode does **not** render the provider dropdown
2. draft mode **does** render the provider dropdown
3. zero-session initial state shows the new helper copy and no provider dropdown
4. existing-session browse state still marks the active session button correctly
5. clicking **New session** transitions to draft mode, where the provider dropdown becomes visible
6. selecting an existing session while drafting hides the provider dropdown again

## Implementation Notes

- Most of the change belongs in `src/ui/components/SessionListPanel.tsx`.
- `src/mainview/App.tsx` should keep the current draft-mode transitions and only supply the existing state/handlers to the sidebar.
- Existing tests in `tests/ui/SessionListPanel.test.tsx` and `tests/ui/App.test.tsx` should be updated rather than duplicated.
- This design was validated with the visual companion using the **hide until draft mode** option.
