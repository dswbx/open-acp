import {
  formatReleaseTag,
  formatReleaseVersion,
  isPrereleaseVersion,
  type ReleaseBranch,
  type ReleaseVersion,
} from "./versioning.ts";

export type ReleaseChannel = "canary" | "stable";
export type ReleaseBuildScript = "build:canary" | "build:stable";

export interface ReleaseMetadata {
  branch: ReleaseBranch;
  version: string;
  tag: string;
  release_title: string;
  is_prerelease: string;
  build_env: ReleaseChannel;
  build_script: ReleaseBuildScript;
}

export function getReleaseChannel(version: ReleaseVersion): ReleaseChannel {
  return isPrereleaseVersion(version) ? "canary" : "stable";
}

export function getReleaseBuildScript(channel: ReleaseChannel): ReleaseBuildScript {
  return channel === "canary" ? "build:canary" : "build:stable";
}

export function createReleaseMetadata(
  branch: ReleaseBranch,
  releaseVersion: ReleaseVersion,
): ReleaseMetadata {
  const channel = getReleaseChannel(releaseVersion);
  const tag = formatReleaseTag(releaseVersion);

  return {
    branch,
    version: formatReleaseVersion(releaseVersion),
    tag,
    release_title: tag,
    is_prerelease: String(channel === "canary"),
    build_env: channel,
    build_script: getReleaseBuildScript(channel),
  };
}
