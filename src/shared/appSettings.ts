import { SMOKE_PROVIDERS, type SmokeProvider } from "./providerModels.ts";

export const APP_SETTINGS_FILE_NAME = "settings.json";

export type ThemePreferenceSetting = "light" | "dark" | "system";
export type AppSpeedSetting = "standard" | "fast";
export type PullRequestMergeMethod = "merge" | "squash";
export type DefaultSessionModeSetting = "build" | "plan";

export interface GeneralSettings {
  showInMenuBar: boolean;
  preventSleepWhileRunning: boolean;
  requireCmdEnterForLongPrompts: boolean;
  speed: AppSpeedSetting;
  defaultProvider: SmokeProvider;
  defaultSessionMode: DefaultSessionModeSetting;
}

export interface AppearanceSettings {
  themePreference: ThemePreferenceSetting;
  translucentSidebar: boolean;
  contrast: number;
}

export interface GitSettings {
  branchPrefix: string;
  pullRequestMergeMethod: PullRequestMergeMethod;
  forcePush: boolean;
  createDraftPullRequests: boolean;
  autoDeleteOldWorktrees: boolean;
  autoDeleteLimit: number;
  commitInstructions: string;
  pullRequestInstructions: string;
}

export interface AppSettings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  git: GitSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  general: {
    showInMenuBar: false,
    preventSleepWhileRunning: true,
    requireCmdEnterForLongPrompts: false,
    speed: "standard",
    defaultProvider: "codex",
    defaultSessionMode: "build",
  },
  appearance: {
    themePreference: "system",
    translucentSidebar: true,
    contrast: 50,
  },
  git: {
    branchPrefix: "open-acp/",
    pullRequestMergeMethod: "merge",
    forcePush: false,
    createDraftPullRequests: true,
    autoDeleteOldWorktrees: true,
    autoDeleteLimit: 15,
    commitInstructions: "",
    pullRequestInstructions: "",
  },
};

export const APPEARANCE_CONTRAST_MIN = 0;
export const APPEARANCE_CONTRAST_MAX = 100;

export const GIT_AUTO_DELETE_LIMIT_MIN = 1;
export const GIT_AUTO_DELETE_LIMIT_MAX = 1000;

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumberInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function asThemePreference(value: unknown): ThemePreferenceSetting {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_APP_SETTINGS.appearance.themePreference;
}

function asSpeed(value: unknown): AppSpeedSetting {
  return value === "standard" || value === "fast" ? value : DEFAULT_APP_SETTINGS.general.speed;
}

function asDefaultProvider(value: unknown): SmokeProvider {
  return typeof value === "string" && (SMOKE_PROVIDERS as readonly string[]).includes(value)
    ? (value as SmokeProvider)
    : DEFAULT_APP_SETTINGS.general.defaultProvider;
}

function asDefaultSessionMode(value: unknown): DefaultSessionModeSetting {
  return value === "build" || value === "plan"
    ? value
    : DEFAULT_APP_SETTINGS.general.defaultSessionMode;
}

function asMergeMethod(value: unknown): PullRequestMergeMethod {
  return value === "merge" || value === "squash"
    ? value
    : DEFAULT_APP_SETTINGS.git.pullRequestMergeMethod;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeGeneral(input: unknown): GeneralSettings {
  const candidate = asObject(input);
  const defaults = DEFAULT_APP_SETTINGS.general;
  return {
    showInMenuBar: asBoolean(candidate?.showInMenuBar, defaults.showInMenuBar),
    preventSleepWhileRunning: asBoolean(
      candidate?.preventSleepWhileRunning,
      defaults.preventSleepWhileRunning,
    ),
    requireCmdEnterForLongPrompts: asBoolean(
      candidate?.requireCmdEnterForLongPrompts,
      defaults.requireCmdEnterForLongPrompts,
    ),
    speed: asSpeed(candidate?.speed),
    defaultProvider: asDefaultProvider(candidate?.defaultProvider),
    defaultSessionMode: asDefaultSessionMode(candidate?.defaultSessionMode),
  };
}

function normalizeAppearance(input: unknown): AppearanceSettings {
  const candidate = asObject(input);
  const defaults = DEFAULT_APP_SETTINGS.appearance;
  return {
    themePreference: asThemePreference(candidate?.themePreference),
    translucentSidebar: asBoolean(candidate?.translucentSidebar, defaults.translucentSidebar),
    contrast: asNumberInRange(
      candidate?.contrast,
      APPEARANCE_CONTRAST_MIN,
      APPEARANCE_CONTRAST_MAX,
      defaults.contrast,
    ),
  };
}

function normalizeGit(input: unknown): GitSettings {
  const candidate = asObject(input);
  const defaults = DEFAULT_APP_SETTINGS.git;
  return {
    branchPrefix: asString(candidate?.branchPrefix, defaults.branchPrefix),
    pullRequestMergeMethod: asMergeMethod(candidate?.pullRequestMergeMethod),
    forcePush: asBoolean(candidate?.forcePush, defaults.forcePush),
    createDraftPullRequests: asBoolean(
      candidate?.createDraftPullRequests,
      defaults.createDraftPullRequests,
    ),
    autoDeleteOldWorktrees: asBoolean(
      candidate?.autoDeleteOldWorktrees,
      defaults.autoDeleteOldWorktrees,
    ),
    autoDeleteLimit: Math.round(
      asNumberInRange(
        candidate?.autoDeleteLimit,
        GIT_AUTO_DELETE_LIMIT_MIN,
        GIT_AUTO_DELETE_LIMIT_MAX,
        defaults.autoDeleteLimit,
      ),
    ),
    commitInstructions: asString(candidate?.commitInstructions, defaults.commitInstructions),
    pullRequestInstructions: asString(
      candidate?.pullRequestInstructions,
      defaults.pullRequestInstructions,
    ),
  };
}

export function normalizeAppSettings(state: unknown): AppSettings {
  const candidate = asObject(state);
  return {
    general: normalizeGeneral(candidate?.general),
    appearance: normalizeAppearance(candidate?.appearance),
    git: normalizeGit(candidate?.git),
  };
}
