# Random Dev Ports

## What Changed

- Replaced the fixed `bun run dev` Vite port with `scripts/dev.ts`.
- Added automatic random high-port selection for `bun run dev` and `bun run dev:web`.
- Kept `OPENACP_DEV_SERVER_PORT` as an explicit override that fails clearly when occupied.
- Kept `bun run dev:desktop` unchanged.
- Created Electrobun's ignored `dist` watch directory and a placeholder `index.html` before desktop dev startup so clean workspaces can launch without a prior build.
- Passed `OPENACP_DEV_SERVER_HOST` through the launcher so the app probes the same loopback host Vite is bound to.

## Verification

- `bunx vitest run tests/bun/devServerPort.test.ts tests/ui/viteConfig.test.ts tests/release/packageScripts.test.ts`
- `bun run typecheck`
- `bunx prettier --check scripts/dev.ts src/bun/devServerPort.ts tests/bun/devServerPort.test.ts tests/ui/viteConfig.test.ts tests/release/packageScripts.test.ts package.json vite.config.ts`
- Smoke checked `bun ./scripts/dev.ts --web-only`; Vite started on a random high port and was stopped cleanly.
- Removed `dist` and smoke checked `env -u OPENACP_DEV_SERVER_PORT bun run dev`; Electrobun started, the app logged HMR enabled for the random Vite port, and the dev processes were stopped.
