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

Install dependencies:

```bash
npm install
```

Typecheck:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build core + UI:

```bash
npm run build
```

Run with Electrobun:

```bash
npm run app:start
```

Run with HMR (recommended during development):

```bash
npm run app:dev:hmr
```

## In-App Real Agent Chat (No CLI Interaction Needed)

### Prerequisites

- Install dependencies: `npm install`.
- Authenticate any provider required by your target agent.
- Ensure `opencode` is installed on your `PATH` for OpenCode tests.
- Allow `npx` downloads for Codex/Claude ACP adapters.

### How to test

1. Start the app with Electrobun (`npm run app:start` or `npm run app:dev:hmr`).
2. In the left **Sessions** panel, click **New session**.
3. Choose the provider that appears in draft mode.
4. Click **Create session**.
5. After the session becomes active, optionally change the model below the message box in the center **Chat** panel.
6. Enter a message in the center **Chat** panel and click **Send** (or press Enter).
7. To prepare a different session, click **New session** again to return to draft mode.
8. The assistant response streams directly into the same chat thread, and streaming state is shown inline on the assistant message.
9. Optional runtime logs remain visible in the right panel.

- The provider picker is only shown while the sidebar is in draft mode.

### Model picker behavior

- The picker always includes **Default model**.
- The app discovers additional models from ACP session setup responses (`session/new` and `session/load`).
- If a provider does not advertise models during ACP session setup, the UI explains that and chat still works with **Default model**.

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

--

copilot --resume=52a21cfc-aea1-406c-80d3-0646277057d1
