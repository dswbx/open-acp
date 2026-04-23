import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
};

describe("release build scripts", () => {
  it("build the UI before packaging release artifacts", () => {
    const packageJsonPath = resolve(import.meta.dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;

    expect(packageJson.scripts?.["build:canary"]).toContain("bun run build:ui &&");
    expect(packageJson.scripts?.["build:stable"]).toContain("bun run build:ui &&");
  });
});
