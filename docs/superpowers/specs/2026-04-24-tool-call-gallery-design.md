# Tool Call Gallery Design

## Problem

Tool calls already render compactly in the chat surface, but improving that UI currently requires running or replaying agent conversations. We need a UI-only development entry point that shows the recorded tool calls already stored under `.acp/sessions`, so tool-call presentation can be inspected and iterated without speaking to agents.

## Scope

- Add a web-only tool-call gallery entry point inside the existing `src/mainview` Vite app.
- Read recorded tool-call events from `.acp/sessions/*/events.jsonl` during Vite dev.
- Normalize recorded `tool_call` and `tool_call_update` events into the same shape expected by the existing mainview tool-call renderer.
- Provide filters and enough surrounding metadata to compare tool-call kinds, states, providers, and sessions.
- Keep the first slice focused on local development for the UI-only web app.

## Out Of Scope

- Changing provider runtime behavior or ACP protocol mappings.
- Writing new `.acp` recordings.
- Shipping the gallery as visible desktop-app navigation.
- Replacing the existing chat surface or `CompactToolCall` component.
- Building a general transcript inspector for all message and protocol event types.

## Goals And Success Criteria

1. Running the web UI can show a gallery of all recorded tool calls from the repo-local `.acp` directory.
2. The gallery works without creating a session or sending a prompt to any agent.
3. Existing tool-call presentation logic is reused so gallery improvements apply to the real chat surface.
4. Tool calls from partial, unknown, or provider-specific event shapes still render with useful fallback labels.
5. Developers can filter by provider, session, kind, and state.
6. Input, output, and error payloads remain inspectable for each call.

## Selected Approach

Use a dedicated mainview route selected by location state, such as `?view=tool-calls`. This keeps the tool-call gallery inside the same Vite root, CSS, shadcn components, aliases, and React setup as the shipped desktop UI while avoiding Electrobun-only runtime wiring.

This approach is preferred over a separate Vite app because it minimizes build configuration churn and reduces drift from the real app. It is also preferred over embedding the gallery inside the normal desktop shell because the first need is a focused UI workbench, not a user-facing debug mode.

## Architecture And Boundaries

### Vite Dev Endpoint

Extend the existing dev-server middleware in `vite.config.ts` with a read-only endpoint such as `/__open-acp/tool-calls`. The endpoint scans `.acp/sessions`, reads each `events.jsonl`, and extracts `chatStreamEvent` payloads with `kind` equal to `tool_call` or `tool_call_update`.

The endpoint is development-only, like the existing session recording endpoint. It should not add new Electrobun RPC, provider runtime behavior, or ACP surface area.

### Extraction And Normalization

Create a small shared reader module for gallery data rather than putting parsing logic directly in the Vite config. The reader should:

1. Find session directories under `.acp/sessions`.
2. Parse `metadata.json` when present.
3. Parse `events.jsonl` line by line, ignoring blank lines.
4. Keep only tool-call chat stream events.
5. Merge events by `sessionId + toolCallId`, preserving the latest state while retaining earlier input, title, kind, and timestamp when later updates omit them.
6. Return records that can be converted to `ChatToolCall` without provider-specific UI branches.

The normalized record should include:

- `sessionId`
- `requestId`
- `provider`
- `cwd`
- `toolCallId`
- `toolTitle`
- `toolKind`
- `toolState`
- `input`
- `output`
- `errorText`
- `timestamp`
- source file information such as `.acp/sessions/<session>/events.jsonl`

### Mainview Entry Selection

Update `src/mainview/main.tsx` or a small app-router wrapper so `?view=tool-calls` renders the gallery instead of the normal desktop app shell. The normal app remains the default for all other URLs, including Electrobun loads.

### Gallery UI

Create a feature-owned gallery under `src/mainview/features/tool-calls`. The UI should be a dense development workbench:

- Header with total call count and loaded session count.
- Left filter rail for provider, session, kind, and state.
- Main list of normalized calls rendered through `CompactToolCall`.
- Per-call metadata row showing provider, kind, state, session, and timestamp.
- Expandable payload details using the same `ToolInput` and `ToolOutput` behavior already used by `CompactToolCall`.
- Loading, error, and empty states.

The UI should use shadcn components and theme tokens only. It should feel like an operational tool, not a landing page.

## Data Flow

1. Developer starts the web UI with `bun run dev:web`.
2. Browser opens the mainview app with `?view=tool-calls`.
3. The gallery fetches `/__open-acp/tool-calls`.
4. Vite middleware scans `.acp/sessions` and returns normalized tool-call records.
5. The gallery applies client-side filters.
6. Each visible record is converted to `ChatToolCall` using the existing `formatToolPresentation` helper and rendered through `CompactToolCall`.
7. UI changes made to tool-call rendering can be verified against real recorded data immediately.

## Error Handling And Safeguards

- If `.acp/sessions` does not exist, return an empty result instead of failing the page.
- If a session has malformed JSON lines, skip those lines and return a warning count.
- If a session metadata file is missing or malformed, infer what is possible from event payloads.
- If a tool-call update omits the original input or title, preserve the earlier values from the merged record.
- If a tool kind or title is unknown, fall back to existing generic presentation behavior.
- Keep the endpoint read-only and local to Vite dev middleware.

## Testing Strategy

- Add unit coverage for the extraction and merge helper using synthetic event records that include:
  - input followed by output
  - output-only update
  - unknown tool kind
  - malformed JSON line
  - missing metadata
- Add UI render coverage for the gallery with a small in-memory fixture:
  - loading state
  - non-empty list
  - provider/kind/state filters
  - empty filtered result
- Keep existing `CompactToolCall` tests as the behavioral guard for compact rendering.
- Run `bun run typecheck:ui` and targeted Vitest coverage for the new units before wrapping implementation.

## Risks And Mitigations

- **Risk:** The gallery normalizes data differently from the live chat path.
  - **Mitigation:** Convert records into `ChatToolCall` and use `formatToolPresentation` plus `CompactToolCall` rather than adding a separate renderer.
- **Risk:** Vite config becomes a dumping ground for parsing logic.
  - **Mitigation:** Put scanning and merge logic in a focused module and keep middleware thin.
- **Risk:** The route leaks into packaged desktop behavior.
  - **Mitigation:** Make the normal app shell the default and keep the gallery selected only by an explicit query parameter.
- **Risk:** Recorded sessions include provider-specific or incomplete payloads.
  - **Mitigation:** Preserve raw input/output values and rely on fallback presentation when richer summaries are unavailable.
