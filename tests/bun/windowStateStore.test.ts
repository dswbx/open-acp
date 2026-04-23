import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWindowStateStore,
  type PersistedWindowState,
} from "../../src/bun/windowStateStore.ts";

const tempDirectories: string[] = [];

describe("windowStateStore", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("reads a saved frame and clamps width and height to the minimum", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-window-state-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "window-state.json");

    await writeFile(
      filePath,
      JSON.stringify({
        x: 12,
        y: 18,
        width: 200,
        height: 300,
        isMaximized: true,
      } satisfies PersistedWindowState),
    );

    const store = createWindowStateStore({ filePath, minWidth: 800, minHeight: 600 });

    expect(store.read()).toEqual({
      x: 12,
      y: 18,
      width: 800,
      height: 600,
      isMaximized: true,
    });
  });

  it("writes hidden window state as JSON", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-window-state-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "window-state.json");
    const store = createWindowStateStore({ filePath, minWidth: 800, minHeight: 600 });

    await store.write({
      x: 40,
      y: 50,
      width: 1200,
      height: 900,
      isMaximized: false,
    });

    await expect(readFile(filePath, "utf8")).resolves.toContain('"width": 1200');
  });
});
