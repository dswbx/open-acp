# Agent Orchestrator POC

Claude-first ACP orchestrator foundation with:

- TypeScript (ESM) core services
- Electrobun runtime as the app host (`src/bun/index.ts`)
- ACP client, adapter contracts, and session orchestration classes
- React + Vite main view (`src/mainview`) with Tailwind v4 and Base UI primitives

## Project Structure

- `src/core/acp/*`: ACP protocol types, transport contract, client, and known protocol limitations.
- `src/core/adapters/*`: Adapter abstraction, registry, capability discovery service, and Claude/Codex/OpenCode adapter implementations.
- `src/core/session/*`: Session orchestration and event routing.
- `src/bun/*`: Electrobun main process entry and runtime wiring.
- `src/shared/*`: Typed Electrobun RPC schema.
- `src/mainview/*`: Electrobun webview UI, including in-app provider chat with streamed responses.
- `src/ui/*`: Reusable UI components consumed by `src/mainview`.
- `tests/*`: Unit tests across ACP core, adapters, orchestrator, and UI shell rendering.

## UI Notes

- `src/mainview` supports theme preference (`System`, `Light`, `Dark`) with local persistence.
- Chat transcript rendering in `src/mainview` uses AI Elements conversation/message primitives with streaming placeholders.

## ACP Capability Notes

The implementation bakes in current protocol observations:

- `session/stop` is treated as unsupported by default (matrix indicates no broad support).
- `session/list`, `session/fork`, and `session/resume` are feature-detected from `initialize`.
- Model catalog/context window metadata are normalized as optional fields because stable ACP schema does not guarantee them.

See `src/core/acp/ACPProtocolInsights.ts`.

## Development

This repo uses [Bun](https://bun.sh/) as the package manager and runtime (Electrobun is Bun-native). Install Bun first: `curl -fsSL https://bun.sh/install | bash`.

Install dependencies:

```bash
bun install
```

Typecheck:

```bash
bun run typecheck
```

Lint and format:

```bash
bun run lint
bun run format:check
```

Run tests:

```bash
bun test           # unit tests (via vitest)
bun run test:e2e   # end-to-end replay suite
```

Build core + UI:

```bash
bun run build
```

Run with Electrobun (build + run):

```bash
bun run start
```

Run with HMR (recommended during development):

```bash
bun run dev
```

Run just the web UI for display work:

```bash
bun run dev:web
```

To restore a recorded session in the browser, append `?sessionId=<session-id>` to the Vite URL, for example:

```text
http://localhost:5173/?sessionId=019dae9a-a40e-75f3-90e2-9915f09ce034
```

This reads the raw recording from `.acp/sessions/<session-id>/metadata.json`, `messages.jsonl`, and `events.jsonl`. The three-file layout is intentional: metadata is mutable session context, messages are the compact chat transcript, and events preserve the richer replay/UI state.

## Contributing

- Entry points: `src/bun/index.ts` (main process), `src/mainview/main.tsx` (renderer). See [AGENTS.md](AGENTS.md) for surface/ownership rules.
- Before opening a PR, run `bun run typecheck && bun run lint && bun run test`. CI runs these plus `format:check` on every PR.
- E2E tests (`bun run test:e2e`) run in CI on the `main` branch and when a PR has the `run-e2e` label.
- UI work must target `src/mainview` (not `src/ui/App.tsx`) and use shadcn primitives + theme tokens.

## In-App Real Agent Chat (No CLI Interaction Needed)

### Prerequisites

- Install dependencies: `bun install`.
- Authenticate any provider required by your target agent.
- Ensure `opencode` is installed on your `PATH` for OpenCode tests.
- Allow `bunx` downloads for Codex/Claude ACP adapters.

### How to test

1. Start the app with Electrobun (`bun run start` or `bun run dev`).
2. In the left **Sessions** panel, click **New session**.
3. Choose the provider that appears in draft mode.
4. Click **Create session**.
5. After the session becomes active, optionally change the model below the message box in the center **Chat** panel.
6. Enter a message in the center **Chat** panel and click **Send** (or press Enter).
7. To prepare a different session, click **New session** again to enter draft mode while the current chat stays active until you select or create another session.
8. The assistant response streams directly into the same chat thread, and a **Thinking** state is shown below the streamed assistant message until completion.
9. Optional runtime logs remain visible in the right panel.

- The provider picker is only shown while the sidebar is in draft mode.

### Model picker behavior

- The picker always includes **Default model**.
- The app discovers additional models from provider session setup responses.
- When a provider reports model variants that only differ by thinking level, the UI groups them under one model picker and shows a separate **Thinking level** selector.
- If a provider does not advertise models during session setup, the UI explains that and chat still works with **Default model**.

### Expected Output + Common Failures

Look for chat/runtime signals indicating:

- provider session creation (`sessionId`)
- streamed `agent_chunk` updates
- completion status (`agent_complete`) or explicit error events

Common failures:

- `spawn ... ENOENT`: CLI/binary is not installed or not on `PATH`.
- `Agent process exited unexpectedly`: the agent failed to start in ACP stdio mode.
- JSON-RPC or auth errors on `session/new`/`session/prompt`: authenticate provider/agent first and retry.

## Extending to Additional Agents

1. Create a new adapter class extending `AgentAdapter`.
2. Reuse `ACPClient` for protocol requests/notifications.
3. Normalize capability and model metadata into `NormalizedAgentCapabilities`.
4. Register the adapter in `AdapterRegistry` and use it through `SessionOrchestrator`.

Codex and OpenCode adapters are now implemented in `src/core/adapters/CodexAdapter.ts` and `src/core/adapters/OpenCodeAdapter.ts` with coverage in `tests/adapters/`.
