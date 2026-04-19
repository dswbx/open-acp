import type { SmokeBridge } from "../bridge/SmokeBridge.ts";
import type { MentionItem } from "./MentionList.tsx";

const MAX_ENTRIES = 2000;
const MAX_DEPTH = 5;
const SKIP_DIRECTORY_NAMES = new Set([
   "node_modules",
   ".git",
   "dist",
   "build",
   ".next",
   ".turbo",
   ".cache",
   ".vite",
   "out",
   "coverage",
   ".venv",
   "venv",
   "__pycache__",
   ".DS_Store",
]);

interface CacheEntry {
   promise: Promise<MentionItem[]>;
   timestamp: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

export function invalidateWorkspaceIndex(cwd?: string) {
   if (cwd === undefined) {
      cache.clear();
      return;
   }
   cache.delete(cwd);
}

export function loadWorkspaceIndex(
   bridge: SmokeBridge,
   cwd: string,
): Promise<MentionItem[]> {
   const cached = cache.get(cwd);
   const now = Date.now();
   if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.promise;
   }
   const promise = crawl(bridge, cwd);
   cache.set(cwd, { promise, timestamp: now });
   promise.catch(() => cache.delete(cwd));
   return promise;
}

async function crawl(
   bridge: SmokeBridge,
   cwd: string,
): Promise<MentionItem[]> {
   if (!bridge.isAvailable()) return [];
   const results: MentionItem[] = [];
   const queue: { absolutePath: string; depth: number }[] = [
      { absolutePath: cwd, depth: 0 },
   ];

   while (queue.length > 0 && results.length < MAX_ENTRIES) {
      const next = queue.shift();
      if (!next) break;
      let entries;
      try {
         const listing = await bridge.listDirectory(next.absolutePath);
         entries = listing.entries;
      } catch {
         continue;
      }
      for (const entry of entries) {
         if (entry.name.startsWith(".") && entry.name !== ".env") continue;
         if (SKIP_DIRECTORY_NAMES.has(entry.name)) continue;
         const relative = toRelative(cwd, entry.path);
         if (entry.kind === "directory") {
            results.push({
               id: relative,
               label: relative + "/",
               kind: "directory",
            });
            if (next.depth + 1 < MAX_DEPTH) {
               queue.push({
                  absolutePath: entry.path,
                  depth: next.depth + 1,
               });
            }
         } else if (entry.kind === "file") {
            results.push({ id: relative, label: relative, kind: "file" });
         }
         if (results.length >= MAX_ENTRIES) break;
      }
   }
   return results;
}

function toRelative(root: string, absolute: string): string {
   const normalizedRoot = root.endsWith("/") ? root : root + "/";
   return absolute.startsWith(normalizedRoot)
      ? absolute.slice(normalizedRoot.length)
      : absolute;
}

export function filterWorkspaceIndex(
   index: MentionItem[],
   query: string,
): MentionItem[] {
   const trimmed = query.trim().toLowerCase();
   if (trimmed.length === 0) return index.slice(0, 20);
   const scored: Array<{ item: MentionItem; score: number }> = [];
   for (const item of index) {
      const label = item.label.toLowerCase();
      const exactIndex = label.indexOf(trimmed);
      if (exactIndex === -1) continue;
      const basename = label.split("/").pop() ?? label;
      const basenameMatch = basename.startsWith(trimmed) ? 0 : 1;
      scored.push({ item, score: exactIndex + basenameMatch * 10 });
      if (scored.length >= 200) break;
   }
   scored.sort((a, b) => a.score - b.score);
   return scored.slice(0, 20).map((entry) => entry.item);
}
