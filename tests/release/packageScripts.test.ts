import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
};

describe("release build scripts", () => {
  it("runs dev servers through the random port launcher", () => {
    const packageJsonPath = resolve(import.meta.dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;

    expect(packageJson.scripts?.dev).toBe("bun ./scripts/dev.ts");
    expect(packageJson.scripts?.["dev:web"]).toBe("bun ./scripts/dev.ts --web-only");
    expect(packageJson.scripts?.dev).not.toContain("5173");
    expect(packageJson.scripts?.["dev:web"]).not.toContain("5173");
  });

  it("keeps the standalone desktop dev script unchanged", () => {
    const packageJsonPath = resolve(import.meta.dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;

    expect(packageJson.scripts?.["dev:desktop"]).toBe("electrobun dev --watch");
  });

  it("build the UI before packaging release artifacts", () => {
    const packageJsonPath = resolve(import.meta.dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;

    expect(packageJson.scripts?.["build:canary"]).toContain("bun run build:native:mac &&");
    expect(packageJson.scripts?.["build:canary"]).toContain("bun run build:ui &&");
    expect(packageJson.scripts?.["build:stable"]).toContain("bun run build:native:mac &&");
    expect(packageJson.scripts?.["build:stable"]).toContain("bun run build:ui &&");
  });
});
