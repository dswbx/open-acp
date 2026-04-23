import { execFileSync } from "node:child_process";

export const RELEASE_TIME_ZONE = "Europe/Zurich";

const RELEASE_TAG_PATTERN = /^v(\d{4})\.(\d{1,2})\.(\d+)(?:-beta\.(\d+))?$/u;

export type ReleaseBranch = "develop" | "main";

export interface ReleaseVersion {
  year: number;
  month: number;
  index: number;
  beta: number | null;
}

interface ReleasePeriod {
  year: number;
  month: number;
}

export function parseReleaseTag(tag: string): ReleaseVersion | null {
  const match = RELEASE_TAG_PATTERN.exec(tag);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, indexText, betaText] = match;
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const index = Number.parseInt(indexText, 10);
  const beta = betaText === undefined ? null : Number.parseInt(betaText, 10);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(index) ||
    month < 1 ||
    month > 12 ||
    index < 0 ||
    (beta !== null && (!Number.isInteger(beta) || beta < 1))
  ) {
    return null;
  }

  return {
    year,
    month,
    index,
    beta,
  };
}

export function formatReleaseVersion(version: ReleaseVersion): string {
  const stableVersion = `${version.year}.${version.month}.${version.index}`;
  if (version.beta === null) {
    return stableVersion;
  }
  return `${stableVersion}-beta.${version.beta}`;
}

export function formatReleaseTag(version: ReleaseVersion): string {
  return `v${formatReleaseVersion(version)}`;
}

export function isPrereleaseVersion(version: ReleaseVersion): boolean {
  return version.beta !== null;
}

export function getReleasePeriod(now: Date, timeZone: string = RELEASE_TIME_ZONE): ReleasePeriod {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "numeric",
  });
  const parts = formatter.formatToParts(now);
  const year = Number.parseInt(parts.find((part) => part.type === "year")?.value ?? "", 10);
  const month = Number.parseInt(parts.find((part) => part.type === "month")?.value ?? "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`Unable to derive release period for timezone ${timeZone}.`);
  }

  return { year, month };
}

export function listGitReleaseTags(cwd: string = process.cwd()): string[] {
  const output = execFileSync("git", ["tag", "--list", "v*"], {
    cwd,
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function computeNextVersion({
  branch,
  tags,
  now = new Date(),
  timeZone = RELEASE_TIME_ZONE,
}: {
  branch: ReleaseBranch;
  tags: string[];
  now?: Date;
  timeZone?: string;
}): ReleaseVersion {
  const period = getReleasePeriod(now, timeZone);
  const versions = tags
    .map((tag) => parseReleaseTag(tag))
    .filter((version): version is ReleaseVersion => version !== null)
    .filter((version) => version.year === period.year && version.month === period.month);

  const stableIndices = new Set(
    versions.filter((version) => version.beta === null).map((version) => version.index),
  );
  const prereleaseMaxByIndex = new Map<number, number>();

  for (const version of versions) {
    if (version.beta === null) {
      continue;
    }
    const currentMax = prereleaseMaxByIndex.get(version.index) ?? 0;
    prereleaseMaxByIndex.set(version.index, Math.max(currentMax, version.beta));
  }

  const allIndices = versions.map((version) => version.index);
  const highestKnownIndex = allIndices.length === 0 ? -1 : Math.max(...allIndices);
  const pendingIndices = [...prereleaseMaxByIndex.keys()].filter(
    (index) => !stableIndices.has(index),
  );
  const highestPendingIndex = pendingIndices.length === 0 ? null : Math.max(...pendingIndices);

  if (branch === "develop") {
    if (highestPendingIndex !== null) {
      return {
        year: period.year,
        month: period.month,
        index: highestPendingIndex,
        beta: (prereleaseMaxByIndex.get(highestPendingIndex) ?? 0) + 1,
      };
    }

    return {
      year: period.year,
      month: period.month,
      index: highestKnownIndex + 1,
      beta: 1,
    };
  }

  if (highestPendingIndex !== null) {
    return {
      year: period.year,
      month: period.month,
      index: highestPendingIndex,
      beta: null,
    };
  }

  return {
    year: period.year,
    month: period.month,
    index: highestKnownIndex + 1,
    beta: null,
  };
}
