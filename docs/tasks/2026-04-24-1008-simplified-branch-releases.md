# Simplified Branch Releases

## What Was Done

- Kept the existing single GitHub Actions release workflow.
- Extracted release output metadata into a pure helper so branch/channel behavior is testable outside GitHub Actions.
- Added tests that lock in:
  - canary prerelease metadata for `develop`
  - stable release metadata for `main`
  - release workflow gating on typecheck, lint/format, and tests
  - computed build script selection for canary/stable packaging
  - updater feed publishing for the computed channel
  - PR-only `main` -> `develop` sync after stable releases
- Recorded the approved release plan in `docs/plans/`.

## Decisions

- The stable sync remains an automatic PR, not an automatic merge.
- The workflow remains branch-driven instead of introducing separate manual release workflows.
- Existing release helper scripts remain the source of truth for version computation.

## Verification

- Focused release tests and typecheck should be run before handoff.
