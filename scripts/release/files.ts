import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VERSION_FILE_PATHS = {
  packageJson: "package.json",
  electrobunConfig: "electrobun.config.ts",
  appVersionModule: "src/shared/appVersion.ts",
} as const;

export function updatePackageJsonVersion(content: string, version: string): string {
  const parsed = JSON.parse(content) as { version?: string };
  parsed.version = version;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updateElectrobunConfigVersion(content: string, version: string): string {
  const updated = content.replace(/(app:\s*\{[\s\S]*?\bversion:\s*")[^"]+(")/u, `$1${version}$2`);
  if (updated === content) {
    throw new Error("Failed to update version in electrobun.config.ts");
  }
  return updated;
}

export function updateAppVersionModule(content: string, version: string): string {
  const updated = content.replace(/(export const APP_VERSION = ")[^"]+(")/u, `$1${version}$2`);
  if (updated === content) {
    throw new Error("Failed to update version in src/shared/appVersion.ts");
  }
  return updated;
}

export function applyVersionToRepo(rootDir: string, version: string): void {
  const packageJsonPath = path.join(rootDir, VERSION_FILE_PATHS.packageJson);
  const electrobunConfigPath = path.join(rootDir, VERSION_FILE_PATHS.electrobunConfig);
  const appVersionPath = path.join(rootDir, VERSION_FILE_PATHS.appVersionModule);

  writeFileSync(
    packageJsonPath,
    updatePackageJsonVersion(readFileSync(packageJsonPath, "utf8"), version),
    "utf8",
  );
  writeFileSync(
    electrobunConfigPath,
    updateElectrobunConfigVersion(readFileSync(electrobunConfigPath, "utf8"), version),
    "utf8",
  );
  writeFileSync(
    appVersionPath,
    updateAppVersionModule(readFileSync(appVersionPath, "utf8"), version),
    "utf8",
  );
}
