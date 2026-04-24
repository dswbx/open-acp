import { describe, expect, it } from "vitest";
import {
  computeNextVersion,
  formatReleaseTag,
  formatReleaseVersion,
} from "../../scripts/release/versioning.ts";

const APRIL_2026 = new Date("2026-04-23T12:00:00+02:00");
const MAY_2026 = new Date("2026-05-01T09:00:00+02:00");

describe("release versioning", () => {
  it("computes the first prerelease in a month as index zero beta one", () => {
    const version = computeNextVersion({
      branch: "develop",
      tags: [],
      now: APRIL_2026,
    });

    expect(formatReleaseVersion(version)).toBe("2026.4.0-beta.1");
    expect(formatReleaseTag(version)).toBe("v2026.4.0-beta.1");
  });

  it("increments beta within the current unreleased prerelease series", () => {
    const version = computeNextVersion({
      branch: "develop",
      tags: ["v2026.4.0-beta.1", "v2026.4.0-beta.2"],
      now: APRIL_2026,
    });

    expect(formatReleaseVersion(version)).toBe("2026.4.0-beta.3");
  });

  it("promotes the current prerelease series to the first stable release", () => {
    const version = computeNextVersion({
      branch: "main",
      tags: ["v2026.4.0-beta.1", "v2026.4.0-beta.2"],
      now: APRIL_2026,
    });

    expect(formatReleaseVersion(version)).toBe("2026.4.0");
  });

  it("starts the next prerelease series after a stable release lands", () => {
    const version = computeNextVersion({
      branch: "develop",
      tags: ["v2026.4.0-beta.1", "v2026.4.0"],
      now: APRIL_2026,
    });

    expect(formatReleaseVersion(version)).toBe("2026.4.1-beta.1");
  });

  it("resets the release index when the calendar month changes", () => {
    const version = computeNextVersion({
      branch: "develop",
      tags: ["v2026.4.0", "v2026.4.1-beta.2"],
      now: MAY_2026,
    });

    expect(formatReleaseVersion(version)).toBe("2026.5.0-beta.1");
  });
});
