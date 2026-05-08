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

export function getOpenAcpWorkspacesRoot(homeRoot?: string): string {
  return path.join(resolveOpenAcpHomeRoot(homeRoot), "workspaces");
}

export function getOpenAcpWorkspaceRoot(workspaceId: string, homeRoot?: string): string {
  return path.join(getOpenAcpWorkspacesRoot(homeRoot), encodeURIComponent(workspaceId));
}

export function getOpenAcpWorkspaceSettingsPath(workspaceId: string, homeRoot?: string): string {
  return path.join(getOpenAcpWorkspaceRoot(workspaceId, homeRoot), "settings.json");
}

export function getOpenAcpWorkspaceSessionsRoot(workspaceId: string, homeRoot?: string): string {
  return path.join(getOpenAcpWorkspaceRoot(workspaceId, homeRoot), "sessions");
}

export function getOpenAcpWorkspaceSessionDirectory(
  workspaceId: string,
  sessionId: string,
  homeRoot?: string,
): string {
  return path.join(
    getOpenAcpWorkspaceSessionsRoot(workspaceId, homeRoot),
    encodeURIComponent(sessionId),
  );
}
