import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUILayoutStateStore } from "../../src/bun/uiLayoutStateStore.ts";

const tempDirectories: string[] = [];

describe("uiLayoutStateStore", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("writes normalized layout state to the hidden file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-layout-state-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "layout-state.json");
    const store = createUILayoutStateStore({ filePath });

    await store.write({
      isRightSidebarOpen: false,
      leftPanelSize: 320,
      rightPanelSize: 420,
    });

    await expect(readFile(filePath, "utf8")).resolves.toContain('"leftPanelSize": 320');
    await expect(store.read()).resolves.toEqual({
      isRightSidebarOpen: false,
      leftPanelSize: 320,
      rightPanelSize: 420,
    });
  });

  it("falls back to default layout state when the file is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-layout-state-"));
    tempDirectories.push(root);
    const store = createUILayoutStateStore({
      filePath: path.join(root, "missing-layout-state.json"),
    });

    await expect(store.read()).resolves.toEqual({
      isRightSidebarOpen: true,
      leftPanelSize: 280,
      rightPanelSize: 320,
    });
  });
});
