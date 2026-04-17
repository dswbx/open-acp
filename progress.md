# Progress Snapshot (2026-04-17)

## Current status

The app is in a solid **MVP-ready** state for real in-app agent chat on Electrobun.

Core flow is working:

1. Left panel keeps session list.
2. Center panel is a real chat window with provider + model picker.
3. Messages are sent to real ACP providers and assistant output streams inline in chat.
4. Right panel shows runtime events/logs.

## What is implemented

### Runtime and protocol

- Electrobun runtime is active (`src/bun/index.ts`).
- ACP stdio transport and client are wired for real providers.
- Provider runtimes are managed per provider (`codex`, `claude`, `opencode`).
- Chat RPC supports `sendChatMessage(provider, message, model?, cwd?)`.
- Model selection is applied through `session/set_model` when selected.

### UI

- Chat provider selector in center panel.
- Model picker in center panel (default + provider-specific presets).
- Streaming state now appears **inside chat messages** (assistant message shows streaming state).
- User/assistant/system messages render in one thread, with provider/model badges.

### Quality + docs

- Typecheck/tests/build are passing after latest changes.
- README reflects in-app chat flow and model selection.
- Todos in SQL are complete through model picker + inline streaming updates.

## Key files to resume quickly

- `src/mainview/App.tsx` — chat UI, provider/model pickers, inline streaming rendering.
- `src/bun/index.ts` — provider runtime lifecycle, model switching, RPC handlers.
- `src/shared/AppRPC.ts` — typed RPC contracts including optional `model`.
- `src/mainview/bridge/SmokeBridge.ts` and `ElectrobunSmokeBridge.ts` — webview bridge.
- `README.md` — current run/test instructions.

## Runbook

```bash
npm install
npm run app:start
```

Then in app:

1. Choose provider in **Chat**.
2. Choose model (or keep **Default model**).
3. Send message.
4. Watch assistant stream directly in chat.

## Known caveats / follow-up opportunities

- Model lists in UI are currently static presets, not dynamically fetched from provider capabilities.
- Session list is still mostly placeholder/demo data (not full persistent multi-session orchestration yet).
- No end-to-end UI automation for live provider streaming yet (unit-level coverage exists).
- Runtime events panel still includes smoke-run style logs; can be simplified into chat diagnostics later.

## Suggested next slice

1. Persist real sessions/chat history and bind left-panel sessions to actual runtime sessions.
2. Replace static model presets with capability-driven model discovery.
3. Add a small in-app reconnect/retry UX for provider startup/auth failures.
