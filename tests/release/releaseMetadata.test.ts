import { describe, expect, it } from "vitest";
import { createReleaseMetadata } from "../../scripts/release/releaseMetadata.ts";

describe("release metadata", () => {
  it("maps develop prereleases to the canary GitHub prerelease channel", () => {
    expect(
      createReleaseMetadata("develop", {
        year: 2026,
        month: 4,
        index: 3,
        beta: 7,
      }),
    ).toEqual({
      branch: "develop",
      version: "2026.4.3-beta.7",
      tag: "v2026.4.3-beta.7",
      release_title: "v2026.4.3-beta.7",
      is_prerelease: "true",
      build_env: "canary",
      build_script: "build:canary",
    });
  });

  it("maps main stable versions to the stable GitHub release channel", () => {
    expect(
      createReleaseMetadata("main", {
        year: 2026,
        month: 4,
        index: 3,
        beta: null,
      }),
    ).toEqual({
      branch: "main",
      version: "2026.4.3",
      tag: "v2026.4.3",
      release_title: "v2026.4.3",
      is_prerelease: "false",
      build_env: "stable",
      build_script: "build:stable",
    });
  });
});
