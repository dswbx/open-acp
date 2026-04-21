# Fix CI UI Checks

## What Was Done

- Fixed UI typecheck failures caused by an alias import with a `.tsx` extension and an unsupported Base UI `SelectTrigger` prop.
- Restored accessible labels and screen-reader-only structure for compact icon-led UI controls in the session list, inspector, theme toggle, model selectors, and composer action.
- Preserved the visible UI direction while making server-rendered tests observe the intended accessibility hooks.

## Verification

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`

## Notes

- GitHub Actions logs could not be fetched locally because the configured `gh` token is invalid.
