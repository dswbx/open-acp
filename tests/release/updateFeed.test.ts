import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getReleaseBaseUrl, syncUpdateFeed } from "../../scripts/release/updateFeed.ts";

const tempDirectories: string[] = [];

describe("updateFeed helpers", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("reads the release base URL from CI environment", () => {
    expect(
      getReleaseBaseUrl({
        ELECTROBUN_RELEASE_BASE_URL: "https://example.github.io/open-acp/updates",
      }),
    ).toBe("https://example.github.io/open-acp/updates");
    expect(getReleaseBaseUrl({})).toBe("");
  });

  it("publishes only updater feed assets for the selected channel and preserves other channels", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "open-acp-update-feed-"));
    tempDirectories.push(root);
    const artifactsDir = path.join(root, "artifacts");
    const feedDir = path.join(root, "feed");
    await mkdir(artifactsDir, { recursive: true });
    await mkdir(feedDir, { recursive: true });
    await writeFile(path.join(artifactsDir, "stable-macos-arm64-update.json"), "{}");
    await writeFile(path.join(artifactsDir, "stable-macos-arm64-OpenACP.app.tar.zst"), "tar");
    await writeFile(path.join(artifactsDir, "stable-macos-arm64-OpenACP.dmg"), "dmg");
    await writeFile(path.join(feedDir, "canary-macos-arm64-update.json"), '{"version":"old"}');
    await writeFile(
      path.join(feedDir, "stable-macos-arm64-old-update.json"),
      '{"version":"stale"}',
    );

    const copied = syncUpdateFeed({
      artifactsDir,
      feedDir,
      channelPrefix: "stable",
    });

    expect(copied.map((entry) => path.basename(entry))).toEqual([
      "stable-macos-arm64-OpenACP.app.tar.zst",
      "stable-macos-arm64-update.json",
    ]);
    await expect(readdir(feedDir)).resolves.toEqual(
      expect.arrayContaining([
        ".nojekyll",
        "canary-macos-arm64-update.json",
        "stable-macos-arm64-OpenACP.app.tar.zst",
        "stable-macos-arm64-update.json",
      ]),
    );
  });
});
