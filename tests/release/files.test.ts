import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyVersionToRepo, VERSION_FILE_PATHS } from "../../scripts/release/files.ts";

const tempDirectories: string[] = [];

describe("applyVersionToRepo", () => {
  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rewrites package metadata, electrobun config, and runtime version in one pass", () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), "open-acp-release-"));
    tempDirectories.push(rootDir);

    writeFileSync(
      path.join(rootDir, VERSION_FILE_PATHS.packageJson),
      `${JSON.stringify({ name: "open-acp", version: "1.0.0" }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(rootDir, VERSION_FILE_PATHS.electrobunConfig),
      [
        "export default {",
        "  app: {",
        '    name: "OpenACP",',
        '    version: "1.0.0",',
        "  },",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    mkdirSync(path.join(rootDir, "src/shared"), { recursive: true });
    writeFileSync(
      path.join(rootDir, VERSION_FILE_PATHS.appVersionModule),
      [
        'export const APP_VERSION = "1.0.0";',
        "export const OPENACP_CLIENT_INFO = { version: APP_VERSION } as const;",
        "",
      ].join("\n"),
      "utf8",
    );

    applyVersionToRepo(rootDir, "2026.4.0-beta.1");

    expect(
      JSON.parse(readFileSync(path.join(rootDir, VERSION_FILE_PATHS.packageJson), "utf8")),
    ).toMatchObject({
      version: "2026.4.0-beta.1",
    });
    expect(readFileSync(path.join(rootDir, VERSION_FILE_PATHS.electrobunConfig), "utf8")).toContain(
      'version: "2026.4.0-beta.1"',
    );
    expect(readFileSync(path.join(rootDir, VERSION_FILE_PATHS.appVersionModule), "utf8")).toContain(
      'export const APP_VERSION = "2026.4.0-beta.1";',
    );
  });
});
