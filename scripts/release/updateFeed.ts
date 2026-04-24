import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export function getReleaseBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.ELECTROBUN_RELEASE_BASE_URL?.trim() ?? "";
}

export interface SyncUpdateFeedOptions {
  artifactsDir: string;
  feedDir: string;
  channelPrefix: string;
}

function shouldPublishArtifact(filename: string, channelPrefix: string): boolean {
  if (!filename.startsWith(`${channelPrefix}-`)) {
    return false;
  }
  return filename.endsWith("-update.json") || filename.endsWith(".tar.zst");
}

export function syncUpdateFeed(options: SyncUpdateFeedOptions): string[] {
  mkdirSync(options.feedDir, { recursive: true });

  for (const entry of readdirSync(options.feedDir)) {
    if (shouldPublishArtifact(entry, options.channelPrefix)) {
      rmSync(path.join(options.feedDir, entry), { force: true });
    }
  }

  const copied: string[] = [];
  for (const entry of readdirSync(options.artifactsDir)) {
    if (!shouldPublishArtifact(entry, options.channelPrefix)) {
      continue;
    }
    const sourcePath = path.join(options.artifactsDir, entry);
    const destinationPath = path.join(options.feedDir, entry);
    cpSync(sourcePath, destinationPath, { force: true });
    copied.push(destinationPath);
  }

  writeFileSync(path.join(options.feedDir, ".nojekyll"), "");
  return copied.sort();
}

function main() {
  const args = process.argv.slice(2);
  const readFlag = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const artifactsDir = readFlag("--artifacts-dir");
  const feedDir = readFlag("--feed-dir");
  const channelPrefix = readFlag("--channel-prefix");
  if (!artifactsDir || !feedDir || !channelPrefix) {
    throw new Error(
      "Usage: bun ./scripts/release/updateFeed.ts --artifacts-dir <dir> --feed-dir <dir> --channel-prefix <stable|canary>",
    );
  }

  if (!existsSync(artifactsDir)) {
    throw new Error(`Artifacts directory does not exist: ${artifactsDir}`);
  }

  const copied = syncUpdateFeed({
    artifactsDir: path.resolve(artifactsDir),
    feedDir: path.resolve(feedDir),
    channelPrefix,
  });

  console.log(`Published ${copied.length} updater artifacts to ${feedDir}`);
}

if (import.meta.main) {
  main();
}
