import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  APP_SETTINGS_FILE_NAME,
  normalizeAppSettings,
  type AppSettings,
} from "../shared/appSettings.ts";
import { resolveOpenAcpHomeRoot } from "./openAcpHome.ts";

interface CreateAppSettingsStoreOptions {
  filePath?: string;
  homeRoot?: string;
}

export function getAppSettingsPath(homeRoot?: string): string {
  return path.join(resolveOpenAcpHomeRoot(homeRoot), APP_SETTINGS_FILE_NAME);
}

export function createAppSettingsStore(options: CreateAppSettingsStoreOptions = {}) {
  const filePath = options.filePath ?? getAppSettingsPath(options.homeRoot);

  return {
    filePath,
    async read(): Promise<AppSettings> {
      try {
        const contents = await readFile(filePath, "utf8");
        return normalizeAppSettings(JSON.parse(contents));
      } catch {
        return normalizeAppSettings(undefined);
      }
    },
    async write(state: AppSettings): Promise<AppSettings> {
      const normalized = normalizeAppSettings(state);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
      return normalized;
    },
  };
}

export type AppSettingsStore = ReturnType<typeof createAppSettingsStore>;
