import type { SettingsSectionId } from "./sections/registry.tsx";

export type SettingsTarget =
  | { type: "section"; sectionId: SettingsSectionId }
  | { type: "workspace"; workspaceId: string };

export function createSectionTarget(sectionId: SettingsSectionId): SettingsTarget {
  return { type: "section", sectionId };
}

export function createWorkspaceTarget(workspaceId: string): SettingsTarget {
  return { type: "workspace", workspaceId };
}

export function isSameSettingsTarget(left: SettingsTarget, right: SettingsTarget): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "section" && right.type === "section") {
    return left.sectionId === right.sectionId;
  }
  if (left.type === "workspace" && right.type === "workspace") {
    return left.workspaceId === right.workspaceId;
  }
  return false;
}
