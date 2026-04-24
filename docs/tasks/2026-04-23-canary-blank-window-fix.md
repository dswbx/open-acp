## Summary

Investigated a blank window in the packaged canary desktop build and traced it to release packaging omitting the Vite renderer assets.

## What Changed

- confirmed the packaged canary app bundle was missing `views/mainview/index.html`
- verified `.github/workflows/ci.yml` release builds invoked `build:canary` and `build:stable`
- found `dist/` is gitignored and Electrobun treats missing `build.copy` sources as non-fatal
- updated release package scripts to run `bun run build:ui` before Electrobun packaging
- added a regression test that asserts the release scripts build the UI before packaging

## Root Cause

The release workflow packaged the app without first generating `dist/`. Because Electrobun logs missing copy sources and continues instead of failing the build, the release succeeded while shipping an app bundle with no packaged `mainview` assets, producing a blank window at runtime.

## Follow-Up

- push the fix to `develop` so CI publishes a fresh canary prerelease with packaged renderer assets
- verify the generated app bundle contains `views/mainview/index.html`
