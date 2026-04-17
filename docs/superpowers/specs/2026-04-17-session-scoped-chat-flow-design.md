# Session-Scoped Chat Flow Design

## Problem

The current `src/mainview` chat panel behaves like a provider-first composer that can send before a session is explicitly selected. It also preloads a system chat message even when no session exists, leaves provider selection available after a session starts, and makes the model picker appear broken when ACP does not advertise any models. The session list already renders as buttons, but the active session state is not visually strong enough to make the selected conversation obvious.

## Goals

- Hide the chat transcript and composer when there is no active session.
- Make new-session setup happen from the sidebar using a draft provider/model selection flow.
- Lock provider choice once a session is established.
- Keep model selection changeable between messages.
- Make the active session visually obvious in the session list.
- Explain empty model catalogs as a valid ACP fallback instead of a broken UI.

## Non-Goals

- Reworking the runtime/orchestrator architecture beyond what is needed for session-scoped UI behavior.
- Adding model refresh controls or background catalog polling.
- Introducing a modal or multi-screen session creation flow.

## Current State

- `src/mainview/App.tsx` initializes `chatMessages` with a bootstrapped system message before any real session exists.
- The center panel always renders `ChatSurface`, the provider picker, the model picker, and the message composer.
- `selectedProvider` is app-global and can be changed even after a session becomes active.
- Model options come only from provider-scoped ACP `initialize()._meta.models` metadata exposed through the runtime catalog path.
- `SessionListPanel` already renders session entries as buttons using `activeSessionId`, but the UI needs stronger selected-state treatment and more reliable state transitions around new-session drafting.

## Chosen Approach

Use a **sidebar-first new-session draft flow** and make the center panel strictly **session-scoped**.

- The left sidebar owns `New session`, the provider selector, and the model selector used before the first message.
- When no session is active, the center panel shows a non-chat empty state instead of a transcript or composer.
- Selecting an existing session restores that session as the active conversation and fixes the provider to that session.
- The provider selector is only editable while drafting a new session.
- The model selector remains editable for both draft and active-session states, affecting only later sends.

This is simpler than introducing a separate create-session view while still satisfying the requirement that chat should not appear without a session.

## State Model

### Draft vs active session

The UI should distinguish between:

1. **Draft mode**
   - no active session selected
   - sidebar controls represent a pending new-session configuration
   - center panel shows no chat UI

2. **Active-session mode**
   - `activeSessionId` points to a real session
   - transcript and composer render for that session only
   - provider is derived from the selected session and cannot be changed directly

`App.tsx` can represent this either with an explicit `isDraftingSession` flag or by treating `activeSessionId === undefined` as draft mode. The important part is that the view logic is session-scoped, not provider-scoped.

### Provider and model ownership

- **Provider** is session-owned after the first message creates or selects a session.
- **Model** remains provider-scoped in selection storage, as it is today, but it is applied only to subsequent sends.
- Selecting a session updates `selectedProvider` to that session's provider so the model picker stays aligned with the active conversation.

## UI Design

### Sidebar

`SessionListPanel` should contain:

1. `New session` action
2. draft provider selector
3. draft model selector
4. session list

Interaction rules:

- Clicking **New session** clears the active session and returns the UI to draft mode.
- In draft mode, provider and model selectors are enabled unless a request/session creation is in progress.
- In active-session mode:
  - provider selector is disabled
  - model selector stays enabled

### Center panel

When no session is active:

- do not render `ChatSurface`
- do not render the message textarea
- do not render the send button
- render a simple empty state indicating that a session must be created or selected first

When a session is active:

- render only that session's transcript
- render the composer for that session
- keep send on the right side of the composer row

### Session list active treatment

Session rows remain buttons, but the active state should be stronger and unambiguous:

- exactly one active button based on `activeSessionId`
- stronger border/background contrast for the selected row
- clear focus-visible styling
- no ambiguous "selected provider but no selected session" visual state

## Session Lifecycle

### Creating a session

Clicking **New session** does not create a runtime session immediately. It prepares draft state in the sidebar.

The first send from draft mode should:

1. create or ensure the target session using the selected draft provider
2. mark the returned session as active
3. lock provider selection for that session
4. send the first user message into that session

If the current implementation keeps explicit `createChatSession`, the same draft provider/model rules should apply there. The UX requirement is that the session must be selected before chat appears.

### Selecting a session

Clicking a session button should:

1. set `activeSessionId`
2. set `selectedProvider` from the session
3. hydrate the provider model catalog if needed
4. show only messages for that session in the center panel

### Sending later messages

- Provider stays fixed to the selected session.
- Model changes are allowed and apply only to later sends.
- Existing request lockouts remain in place during session creation, sending, and streaming.

## Model Catalog Behavior

The UI should continue using the existing runtime-backed provider model catalog.

Important constraint:

- model options are currently populated only from ACP `initialize()._meta.models`
- ACP stable schema does **not** guarantee model metadata

Therefore, an empty list does **not** necessarily mean the app failed. It may mean the provider did not advertise models.

### Required UX behavior

- Always show `Default model`.
- If discovery has not yet happened, the picker can show only `Default model` without error styling.
- If discovery was attempted and no models were returned, show a short hint such as "Provider did not report models via ACP."
- Do not imply that the picker is malfunctioning when the catalog is legitimately empty.

## Data Flow

1. User clicks **New session** in the sidebar.
2. App enters draft mode with no active session.
3. User chooses provider and optional model in the sidebar.
4. User selects an existing session or triggers first-send/create flow.
5. App sets `activeSessionId`, restores the session provider, and hydrates the provider model catalog.
6. Center panel renders transcript/composer only for the active session.
7. Later model changes update subsequent sends without changing provider ownership.

## Error Handling and Safeguards

- If the Electrobun bridge is unavailable, report the error through existing system/log channels, but do not render a fake chat transcript for a non-existent session.
- If session creation fails, remain in draft mode.
- If model discovery fails, keep `Default model` available and surface the fallback explanation rather than a blank-feeling control.
- If a previously selected model is no longer present in the provider catalog, fall back to `Default model`.

## Testing

Add or update tests for:

1. no active session hides transcript and composer
2. clicking `New session` returns the app to draft mode
3. selecting a session marks exactly one session button active
4. selecting a session restores the correct provider
5. provider selector is disabled for active sessions
6. model selector remains enabled across later messages
7. first-send/create flow activates the new session and then renders chat
8. attempted model discovery with no returned models shows the ACP fallback hint

## Implementation Notes

- Most state and rendering changes belong in `src/mainview/App.tsx`.
- Sidebar control placement and selected-row styling belong in `src/ui/components/SessionListPanel.tsx`.
- Reuse the existing provider catalog state helpers and runtime RPC surface instead of creating a second model-discovery path.
- Keep the implementation on `main`, per the testing requirement for this task.
