import { describe, expect, it } from "vitest";
import {
  APPEARANCE_CONTRAST_MAX,
  APPEARANCE_CONTRAST_MIN,
  DEFAULT_APP_SETTINGS,
  GIT_AUTO_DELETE_LIMIT_MAX,
  GIT_AUTO_DELETE_LIMIT_MIN,
  normalizeAppSettings,
} from "../../src/shared/appSettings.ts";

describe("appSettings", () => {
  it("returns the documented defaults when state is absent", () => {
    expect(normalizeAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("falls back to defaults for invalid leaf values", () => {
    expect(
      normalizeAppSettings({
        general: { speed: "warp", showInMenuBar: "true" },
        appearance: { themePreference: 7, contrast: "n/a" },
        git: { pullRequestMergeMethod: "rebase", autoDeleteLimit: -10 },
      }),
    ).toEqual({
      ...DEFAULT_APP_SETTINGS,
      git: {
        ...DEFAULT_APP_SETTINGS.git,
        autoDeleteLimit: GIT_AUTO_DELETE_LIMIT_MIN,
      },
    });
  });

  it("clamps numeric ranges", () => {
    const result = normalizeAppSettings({
      appearance: { contrast: 500 },
      git: { autoDeleteLimit: 99999 },
    });
    expect(result.appearance.contrast).toBe(APPEARANCE_CONTRAST_MAX);
    expect(result.git.autoDeleteLimit).toBe(GIT_AUTO_DELETE_LIMIT_MAX);

    const lower = normalizeAppSettings({
      appearance: { contrast: -50 },
    });
    expect(lower.appearance.contrast).toBe(APPEARANCE_CONTRAST_MIN);
  });

  it("preserves valid input", () => {
    const valid = {
      general: {
        showInMenuBar: true,
        preventSleepWhileRunning: false,
        requireCmdEnterForLongPrompts: true,
        speed: "fast" as const,
        defaultProvider: "claude" as const,
        defaultSessionMode: "plan" as const,
      },
      appearance: {
        themePreference: "dark" as const,
        translucentSidebar: false,
        contrast: 75,
      },
      git: {
        branchPrefix: "demo/",
        pullRequestMergeMethod: "squash" as const,
        forcePush: true,
        createDraftPullRequests: false,
        autoDeleteOldWorktrees: false,
        autoDeleteLimit: 30,
        commitInstructions: "be terse",
        pullRequestInstructions: "use bullets",
      },
    };
    expect(normalizeAppSettings(valid)).toEqual(valid);
  });
});
