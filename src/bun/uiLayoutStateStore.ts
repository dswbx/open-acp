import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getUILayoutStatePath } from "./appPrivateStatePaths.ts";
import { normalizeUILayoutState, type PersistedUILayoutState } from "../shared/uiLayoutState.ts";

interface CreateUILayoutStateStoreOptions {
  filePath?: string;
}

export function createUILayoutStateStore(options: CreateUILayoutStateStoreOptions = {}) {
  const filePath = options.filePath ?? getUILayoutStatePath();

  return {
    async read(): Promise<PersistedUILayoutState> {
      try {
        const contents = await readFile(filePath, "utf8");
        return normalizeUILayoutState(JSON.parse(contents));
      } catch {
        return normalizeUILayoutState(undefined);
      }
    },
    async write(state: PersistedUILayoutState): Promise<void> {
      const normalized = normalizeUILayoutState(state);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(normalized, null, 2));
    },
  };
}
