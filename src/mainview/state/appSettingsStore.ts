import { create } from "zustand";
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
  type AppearanceSettings,
  type GeneralSettings,
  type GitSettings,
} from "../../shared/appSettings.ts";
import type { SmokeBridge } from "../bridge/SmokeBridge.ts";
import { THEME_STORAGE_KEY, parseThemePreference } from "../theme/themePreference.ts";

const PERSIST_DEBOUNCE_MS = 150;
export const APP_SETTINGS_STORAGE_KEY = "open-acp-app-settings";

interface AppSettingsState {
  settings: AppSettings;
  hydrated: boolean;
  setSettings: (settings: AppSettings) => void;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  updateAppearance: (patch: Partial<AppearanceSettings>) => void;
  updateGit: (patch: Partial<GitSettings>) => void;
}

export const useAppSettingsStore = create<AppSettingsState>()((set) => ({
  settings: DEFAULT_APP_SETTINGS,
  hydrated: false,
  setSettings: (settings) => {
    set({ settings: normalizeAppSettings(settings), hydrated: true });
  },
  updateGeneral: (patch) => {
    set((state) => ({
      settings: normalizeAppSettings({
        ...state.settings,
        general: { ...state.settings.general, ...patch },
      }),
    }));
  },
  updateAppearance: (patch) => {
    set((state) => ({
      settings: normalizeAppSettings({
        ...state.settings,
        appearance: { ...state.settings.appearance, ...patch },
      }),
    }));
  },
  updateGit: (patch) => {
    set((state) => ({
      settings: normalizeAppSettings({
        ...state.settings,
        git: { ...state.settings.git, ...patch },
      }),
    }));
  },
}));

function readStoredAppSettingsFromLocalStorage(): AppSettings {
  const raw = globalThis.localStorage?.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return migrateLegacyThemePreference(DEFAULT_APP_SETTINGS);
  }
  try {
    return normalizeAppSettings(JSON.parse(raw));
  } catch {
    return migrateLegacyThemePreference(DEFAULT_APP_SETTINGS);
  }
}

function migrateLegacyThemePreference(base: AppSettings): AppSettings {
  const legacy = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
  if (!legacy) {
    return base;
  }
  const themePreference = parseThemePreference(legacy);
  if (themePreference === base.appearance.themePreference) {
    return base;
  }
  return {
    ...base,
    appearance: { ...base.appearance, themePreference },
  };
}

function writeStoredAppSettingsToLocalStorage(settings: AppSettings): void {
  try {
    globalThis.localStorage?.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota errors */
  }
}

export function hydrateAppSettings(state: unknown): void {
  const settings = normalizeAppSettings(state);
  useAppSettingsStore.setState({ settings, hydrated: true });
}

export function hydrateAppSettingsFromLocalStorage(): void {
  hydrateAppSettings(readStoredAppSettingsFromLocalStorage());
}

export async function hydrateAppSettingsFromBridge(
  bridge: Pick<SmokeBridge, "getAppSettings">,
): Promise<void> {
  const result = await bridge.getAppSettings();
  const fromBridge = normalizeAppSettings(result.settings);
  // If the on-disk file is brand new (matches defaults), seed with any pending
  // legacy theme preference from localStorage so the migration sticks.
  const matchesDefaults = JSON.stringify(fromBridge) === JSON.stringify(DEFAULT_APP_SETTINGS);
  const seeded = matchesDefaults ? migrateLegacyThemePreference(fromBridge) : fromBridge;
  hydrateAppSettings(seeded);
}

export function startAppSettingsPersistence(
  bridge?: Pick<SmokeBridge, "setAppSettings">,
): () => void {
  let lastSerialized = JSON.stringify(useAppSettingsStore.getState().settings);
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSettings: AppSettings | undefined;

  const flush = (): void => {
    if (!pendingSettings) {
      return;
    }
    const settings = pendingSettings;
    pendingSettings = undefined;
    pendingTimer = undefined;
    writeStoredAppSettingsToLocalStorage(settings);
    if (bridge) {
      void bridge.setAppSettings(settings);
    }
  };

  const unsubscribe = useAppSettingsStore.subscribe((state) => {
    if (!state.hydrated) {
      return;
    }
    const serialized = JSON.stringify(state.settings);
    if (serialized === lastSerialized) {
      return;
    }
    lastSerialized = serialized;
    pendingSettings = state.settings;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }
    pendingTimer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
  });

  return () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      flush();
    }
    unsubscribe();
  };
}
