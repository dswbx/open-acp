# Simplified Branch-Based Releases

## Summary

Keep one branch-driven GitHub release process:

- pushes to `develop` publish canary prereleases
- pushes to `main` publish stable releases
- stable releases open a `main` -> `develop` sync PR

The existing release workflow already follows this shape, so this plan is a cleanup and hardening pass rather than a replacement release system.

## Key Changes

- Keep `.github/workflows/ci.yml` as the single GitHub Actions workflow.
- Preserve release gates on typecheck, lint/format, and tests.
- Keep release versioning in `scripts/release/*`.
- Add pure release metadata coverage for canary vs stable branch outputs.
- Add workflow regression coverage for branch triggers, computed packaging, updater feed publishing, and PR-only stable sync.
- Keep sync back as an automatic PR, not an automatic merge.

## Test Plan

- `bun run test -- tests/release/versioning.test.ts tests/release/packageScripts.test.ts tests/release/updateFeed.test.ts tests/release/releaseMetadata.test.ts tests/release/workflow.test.ts`
- `bun run typecheck`

## Assumptions

- `develop` remains the day-to-day canary branch.
- `main` remains the stable release branch.
- GitHub releases and updater feeds stay automated.
- Stable sync back to `develop` stays human-reviewed through a PR.
