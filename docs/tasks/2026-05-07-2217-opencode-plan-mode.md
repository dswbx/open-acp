## Summary

Fixed OpenCode plan-mode exit handling so native `switch_mode` plan reviews are answered before
the app updates local mode state. This prevents the UI/runtime from trying to pre-switch OpenCode
back to build while the provider is still waiting on its own approval response.

## References Checked

- Repo guidance in `AGENTS.md`
- `docs/provider-runtime-openacp.md`
- Installed ACP schema at `node_modules/@agentclientprotocol/sdk/schema/schema.json`
- Live OpenCode ACP handshake with OpenCode `1.14.41`

## ACP Notes

- OpenCode `1.14.41` advertises a `mode` config option with `build` and `plan` values from
  `session/new`.
- OpenCode also advertises legacy ACP `modes` with `currentModeId: "build"` and available modes
  `build` and `plan`.
- `configOptions` and `session/set_config_option` remain the preferred stable mode/config surface.
- Legacy `modes` and `session/set_mode` remain a compatibility fallback.
- Native `switch_mode` plan review approval is provider-owned. The app should answer the provider
  approval first, then optimistically update/hydrate local mode state after the provider accepts the
  response.

## Verification

- `bun run test -- tests/bun/sessionModes.test.ts tests/shared/sessionModes.test.ts tests/ui/App.test.tsx`
- `bun run typecheck`
