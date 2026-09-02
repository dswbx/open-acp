import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPageZoomStateStore,
  normalizePageZoom,
  stepPageZoom,
} from "../../src/bun/pageZoomStateStore.ts";

const tempDirectories: string[] = [];

describe("pageZoomStateStore", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("normalizes zoom values to the supported range and one decimal place", () => {
    expect(normalizePageZoom(0.24)).toBe(0.5);
    expect(normalizePageZoom(1.26)).toBe(1.3);
    expect(normalizePageZoom(2.4)).toBe(2);
    expect(normalizePageZoom(Number.NaN)).toBe(1);
    expect(normalizePageZoom("1.5")).toBe(1);
  });

  it("steps zoom in fixed increments without floating point drift", () => {
    expect(stepPageZoom(1, "in")).toBe(1.1);
    expect(stepPageZoom(1.1, "out")).toBe(1);
    expect(stepPageZoom(1.999999999, "in")).toBe(2);
    expect(stepPageZoom(0.500000001, "out")).toBe(0.5);
  });

  it("reads and writes persisted page zoom state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-page-zoom-state-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "page-zoom-state.json");
    const store = createPageZoomStateStore({ filePath });

    await store.write(1.36);

    await expect(readFile(filePath, "utf8")).resolves.toContain('"zoom": 1.4');
    expect(store.read()).toBe(1.4);
  });

  it("falls back to default page zoom when persisted state is missing or invalid", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-page-zoom-state-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "page-zoom-state.json");
    const store = createPageZoomStateStore({ filePath });

    expect(store.read()).toBe(1);

    await writeFile(filePath, JSON.stringify({ zoom: "wide" }));

    expect(store.read()).toBe(1);
  });
});
