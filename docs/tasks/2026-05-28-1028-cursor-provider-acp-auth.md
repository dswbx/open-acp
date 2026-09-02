# Cursor Provider ACP Auth

## What changed

- Added Cursor as a first-class provider in the shared provider list and runtime launch path.
- Cursor launches through the documented Cursor Agent CLI ACP server: `agent acp`.
- Added ACP `authenticate` support and made the Cursor ACP adapter call `authenticate` with `methodId: "cursor_login"` when that method is advertised.
- Added provider icons across provider selectors and session rows.
- Normalized Cursor's bracketed model IDs, such as `gpt-5.5[context=272k,reasoning=medium,fast=false]`, into a base model picker plus separate context, reasoning, and speed controls only when ACP advertises multiple selectable variants for the same base model.

## Protocol references checked

- Cursor ACP docs: https://cursor.com/docs/cli/acp
  - Documents spawning `agent acp`, communicating over stdio JSON-RPC, calling `authenticate` with `cursor_login`, then creating a session with `session/new`.
- Installed ACP schema: `node_modules/@agentclientprotocol/sdk/schema/schema.json`
  - Includes stable `authenticate` request/response with `methodId`.
  - Auth methods now advertise an `id` and `name`; older `type` values remain tolerated in local normalization for existing tests and compatibility.
- Cursor Agent CLI `2026.05.24-dda726e`
  - `agent models` and `agent --list-models` return richer Cursor aliases such as `gpt-5.5-high-fast`.
  - Current `agent acp` `session/new` returns a flattened `models.availableModels` / `configOptions.model.options` list with bracketed exact IDs such as `gpt-5.5[context=272k,reasoning=medium,fast=false]`.
  - `session/set_config_option` and `session/set_model` reject `agent models` aliases and synthesized bracket variants with `Invalid params`; they accept only exact ACP-advertised model values.

## Protocol decision

- `initialize`, `authenticate`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/request_permission`, and `session/update` are treated as ACP surfaces for this integration.
- Cursor-specific auth choice is adapter-private: only the Cursor provider automatically selects `cursor_login`.
- Cursor plan mode is enabled at the app capability level like other ACP providers, with provider-reported session config still allowed to refine mode behavior later.
- Cursor model parameter handling is UI/state normalization only. The app stores and sends Cursor's exact advertised model ID back to the provider. Parameter controls are hidden when ACP exposes only a single value because those are metadata, not actionable choices.
- `session_info_update` is a standard ACP session metadata update. Cursor sends it with fields such as `title`; the app routes it to session metadata and also shows a compact chat row whose expandable detail contains the raw update payload.

## Follow-ups

- Run `bun run smoke:cursor` on a machine with Cursor Agent CLI installed and already authenticated via `agent login`.
- Revisit Cursor model controls if `agent acp` exposes the richer `agent models` aliases through ACP or starts accepting those aliases through `session/set_config_option`.
- If Cursor ACP exposes provider-specific extension requests beyond stable ACP, normalize them inside the adapter instead of leaking Cursor wire shapes into the app.
