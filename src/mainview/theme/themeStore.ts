import { create } from "zustand";
import { useAppSettingsStore } from "../state/appSettingsStore.ts";
import { resolveThemeMode, type ThemeMode, type ThemePreference } from "./themePreference.ts";

interface ThemeState {
  preference: ThemePreference;
  mode: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
}

function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const initialPreference = useAppSettingsStore.getState().settings.appearance.themePreference;
const initialMode = resolveThemeMode(initialPreference, systemPrefersDark());
applyThemeMode(initialMode);

export const useThemeStore = create<ThemeState>((set) => ({
  preference: initialPreference,
  mode: initialMode,
  setPreference: (preference) => {
    useAppSettingsStore.getState().updateAppearance({ themePreference: preference });
    const mode = resolveThemeMode(preference, systemPrefersDark());
    applyThemeMode(mode);
    set({ preference, mode });
  },
}));

useAppSettingsStore.subscribe((state) => {
  const preference = state.settings.appearance.themePreference;
  const current = useThemeStore.getState();
  if (preference === current.preference) {
    return;
  }
  const mode = resolveThemeMode(preference, systemPrefersDark());
  applyThemeMode(mode);
  useThemeStore.setState({ preference, mode });
});

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", (event) => {
    const state = useThemeStore.getState();
    if (state.preference !== "system") {
      return;
    }
    const mode = resolveThemeMode("system", event.matches);
    applyThemeMode(mode);
    useThemeStore.setState({ mode });
  });
}
