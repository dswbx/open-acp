import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveThemeMode,
  type ThemeMode,
  type ThemePreference,
} from "../../src/mainview/theme/themePreference.ts";

describe("themePreference", () => {
  it("parses persisted values with safe fallback", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("bad-value")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("resolves effective mode from preference and system state", () => {
    expect(resolveThemeMode("light", true)).toBe<ThemeMode>("light");
    expect(resolveThemeMode("dark", false)).toBe<ThemeMode>("dark");
    expect(resolveThemeMode("system", true)).toBe<ThemeMode>("dark");
    expect(resolveThemeMode("system", false)).toBe<ThemeMode>("light");
  });

  it("exposes the expected storage key", () => {
    const key: string = THEME_STORAGE_KEY;
    expect(key).toBe("agent-orchestrator-theme-preference");
  });

  it("keeps preference type closed", () => {
    const values: ThemePreference[] = ["light", "dark", "system"];
    expect(values).toHaveLength(3);
  });
});
