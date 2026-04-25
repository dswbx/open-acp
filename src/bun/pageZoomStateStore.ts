import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getPageZoomStatePath } from "./appPrivateStatePaths.ts";

export const DEFAULT_PAGE_ZOOM = 1;
export const PAGE_ZOOM_STEP = 0.1;
export const MIN_PAGE_ZOOM = 0.5;
export const MAX_PAGE_ZOOM = 2;

interface PersistedPageZoomState {
  zoom: number;
}

interface CreatePageZoomStateStoreOptions {
  filePath?: string;
}

export function normalizePageZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PAGE_ZOOM;
  }

  const clamped = Math.min(Math.max(value, MIN_PAGE_ZOOM), MAX_PAGE_ZOOM);
  return Math.round(clamped * 10) / 10;
}

export function stepPageZoom(currentZoom: number, direction: "in" | "out"): number {
  return normalizePageZoom(currentZoom + (direction === "in" ? PAGE_ZOOM_STEP : -PAGE_ZOOM_STEP));
}

function normalizePageZoomState(state: unknown): PersistedPageZoomState {
  const candidate =
    state && typeof state === "object" ? (state as Partial<PersistedPageZoomState>) : undefined;
  return {
    zoom: normalizePageZoom(candidate?.zoom),
  };
}

export function createPageZoomStateStore(options: CreatePageZoomStateStoreOptions = {}) {
  const filePath = options.filePath ?? getPageZoomStatePath();

  return {
    read(): number {
      if (!existsSync(filePath)) {
        return DEFAULT_PAGE_ZOOM;
      }
      try {
        return normalizePageZoomState(JSON.parse(readFileSync(filePath, "utf8"))).zoom;
      } catch {
        return DEFAULT_PAGE_ZOOM;
      }
    },
    async write(zoom: number): Promise<void> {
      const normalized = normalizePageZoom(zoom);
      mkdirSync(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify({ zoom: normalized }, null, 2));
    },
  };
}
