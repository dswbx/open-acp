import { appendFileSync } from "node:fs";
import {
  computeNextVersion,
  formatReleaseTag,
  formatReleaseVersion,
  isPrereleaseVersion,
  listGitReleaseTags,
  RELEASE_TIME_ZONE,
  type ReleaseBranch,
} from "./versioning.ts";

interface ParsedArgs {
  branch: ReleaseBranch;
  timeZone: string;
  now?: Date;
}

function parseArgs(argv: string[]): ParsedArgs {
  let branch: ReleaseBranch | undefined;
  let timeZone = RELEASE_TIME_ZONE;
  let now: Date | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if ((token === "--branch" || token === "-b") && value) {
      if (value !== "develop" && value !== "main") {
        throw new Error(`Unsupported branch "${value}". Expected develop or main.`);
      }
      branch = value;
      index += 1;
      continue;
    }

    if (token === "--timezone" && value) {
      timeZone = value;
      index += 1;
      continue;
    }

    if (token === "--now" && value) {
      now = new Date(value);
      if (Number.isNaN(now.getTime())) {
        throw new Error(`Invalid --now value: ${value}`);
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete flag: ${token}`);
  }

  if (!branch) {
    throw new Error("Usage: bun ./scripts/release/compute-version.ts --branch <develop|main>");
  }

  return { branch, timeZone, now };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const nextVersion = computeNextVersion({
    branch: args.branch,
    tags: listGitReleaseTags(),
    now: args.now,
    timeZone: args.timeZone,
  });
  const version = formatReleaseVersion(nextVersion);
  const tag = formatReleaseTag(nextVersion);
  const isPrerelease = isPrereleaseVersion(nextVersion);
  const outputs = {
    branch: args.branch,
    version,
    tag,
    release_title: tag,
    is_prerelease: String(isPrerelease),
    build_env: isPrerelease ? "canary" : "stable",
    build_script: isPrerelease ? "build:canary" : "build:stable",
  };

  if (process.env.GITHUB_OUTPUT) {
    const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
  }

  process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
