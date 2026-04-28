import { homedir } from "node:os";
import path from "node:path";

export function resolveOpenAcpHomeRoot(homeRoot?: string): string {
  return homeRoot ?? path.join(homedir(), ".open-acp");
}

export function getOpenAcpSessionsRoot(homeRoot?: string): string {
  return path.join(resolveOpenAcpHomeRoot(homeRoot), "sessions");
}

export function getOpenAcpSessionDirectory(sessionId: string, homeRoot?: string): string {
  return path.join(getOpenAcpSessionsRoot(homeRoot), encodeURIComponent(sessionId));
}
