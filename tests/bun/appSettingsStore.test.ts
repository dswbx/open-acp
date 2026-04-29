import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAppSettingsStore } from "../../src/bun/appSettingsStore.ts";
import { DEFAULT_APP_SETTINGS } from "../../src/shared/appSettings.ts";

const tempDirectories: string[] = [];

describe("appSettingsStore", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("writes normalized settings to the configured file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-app-settings-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "settings.json");
    const store = createAppSettingsStore({ filePath });

    const updated = {
      ...DEFAULT_APP_SETTINGS,
      general: { ...DEFAULT_APP_SETTINGS.general, showInMenuBar: true },
    };

    await store.write(updated);

    const contents = await readFile(filePath, "utf8");
    expect(contents).toContain('"showInMenuBar": true');
    await expect(store.read()).resolves.toEqual(updated);
  });

  it("falls back to defaults when the file is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-app-settings-"));
    tempDirectories.push(root);
    const store = createAppSettingsStore({
      filePath: path.join(root, "missing-settings.json"),
    });

    await expect(store.read()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  });

  it("recovers from a malformed file by returning defaults", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-app-settings-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "settings.json");
    const store = createAppSettingsStore({ filePath });

    // Seed corrupt contents.
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, "{ not json");

    await expect(store.read()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  });
});
