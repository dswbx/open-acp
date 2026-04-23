import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getWindowStatePath } from "./appPrivateStatePaths.ts";

export interface PersistedWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

interface CreateWindowStateStoreOptions {
  filePath?: string;
  minWidth: number;
  minHeight: number;
  debounceMs?: number;
}

function normalizeWindowState(
  state: unknown,
  minimums: { minWidth: number; minHeight: number },
): PersistedWindowState | undefined {
  const candidate =
    state && typeof state === "object" ? (state as Partial<PersistedWindowState>) : undefined;
  if (
    typeof candidate?.x !== "number" ||
    !Number.isFinite(candidate.x) ||
    typeof candidate.y !== "number" ||
    !Number.isFinite(candidate.y) ||
    typeof candidate.width !== "number" ||
    !Number.isFinite(candidate.width) ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.height)
  ) {
    return undefined;
  }

  return {
    x: candidate.x,
    y: candidate.y,
    width: Math.max(candidate.width, minimums.minWidth),
    height: Math.max(candidate.height, minimums.minHeight),
    isMaximized: candidate.isMaximized === true,
  };
}

export function createWindowStateStore(options: CreateWindowStateStoreOptions) {
  const filePath = options.filePath ?? getWindowStatePath();
  const debounceMs = options.debounceMs ?? 150;
  const minimums = {
    minWidth: options.minWidth,
    minHeight: options.minHeight,
  };
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingState: PersistedWindowState | undefined;
  let pendingWrite: Promise<void> | undefined;

  const persist = async (state: PersistedWindowState): Promise<void> => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(state, null, 2));
  };

  const flushPendingState = (): Promise<void> | undefined => {
    if (!pendingState) {
      return pendingWrite;
    }
    const nextState = pendingState;
    pendingState = undefined;
    pendingWrite = persist(nextState);
    return pendingWrite;
  };

  return {
    read(): PersistedWindowState | undefined {
      if (!existsSync(filePath)) {
        return undefined;
      }
      try {
        return normalizeWindowState(JSON.parse(readFileSync(filePath, "utf8")), minimums);
      } catch {
        return undefined;
      }
    },
    scheduleWrite(state: PersistedWindowState): void {
      const normalized = normalizeWindowState(state, minimums);
      if (!normalized) {
        return;
      }
      pendingState = normalized;
      if (writeTimer) {
        clearTimeout(writeTimer);
      }
      writeTimer = setTimeout(() => {
        writeTimer = undefined;
        void flushPendingState();
      }, debounceMs);
    },
    async write(state: PersistedWindowState): Promise<void> {
      const normalized = normalizeWindowState(state, minimums);
      if (!normalized) {
        return;
      }
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = undefined;
      }
      pendingState = normalized;
      await flushPendingState();
    },
    async flush(): Promise<void> {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = undefined;
      }
      await flushPendingState();
      await pendingWrite;
    },
  };
}
