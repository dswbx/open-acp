export type ThemePreference = "light" | "dark" | "system";
export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "agent-orchestrator-theme-preference";

const isThemePreference = (value: string): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

export const parseThemePreference = (
  value: string | null | undefined
): ThemePreference => {
  if (!value) {
    return "system";
  }
  return isThemePreference(value) ? value : "system";
};

export const resolveThemeMode = (
  preference: ThemePreference,
  systemPrefersDark: boolean
): ThemeMode => {
  if (preference === "light") {
    return "light";
  }
  if (preference === "dark") {
    return "dark";
  }
  return systemPrefersDark ? "dark" : "light";
};

export const readStoredThemePreference = (): ThemePreference =>
  parseThemePreference(globalThis.localStorage?.getItem(THEME_STORAGE_KEY));

export const writeStoredThemePreference = (
  preference: ThemePreference
): void => {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, preference);
};
