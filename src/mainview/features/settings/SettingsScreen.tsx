import { useEffect, useState } from "react";
import { navigateTo } from "../../app/routeStore.ts";
import type { SmokeBridge } from "../../bridge/SmokeBridge.ts";
import { useWorkspaceStore } from "../../state/workspaceStore.ts";
import { SettingsSidebar } from "./SettingsSidebar.tsx";
import { DEFAULT_SETTINGS_SECTION_ID, getSettingsSection } from "./sections/registry.tsx";
import { WorkspaceSettingsSection } from "./sections/WorkspaceSettingsSection.tsx";
import { createSectionTarget, type SettingsTarget } from "./settingsTarget.ts";

export function SettingsScreen({ smokeBridge }: { smokeBridge?: SmokeBridge }) {
  const [activeTarget, setActiveTarget] = useState<SettingsTarget>(() =>
    createSectionTarget(DEFAULT_SETTINGS_SECTION_ID),
  );
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  useEffect(() => {
    if (!smokeBridge?.isAvailable()) return;
    let cancelled = false;
    void smokeBridge
      .listWorkspaces()
      .then((result) => {
        if (!cancelled) {
          useWorkspaceStore.getState().setWorkspaces(result.workspaces);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [smokeBridge]);

  useEffect(() => {
    if (activeTarget.type !== "workspace") return;
    if (workspaces.some((workspace) => workspace.id === activeTarget.workspaceId)) return;
    setActiveTarget(createSectionTarget(DEFAULT_SETTINGS_SECTION_ID));
  }, [activeTarget, workspaces]);

  const section =
    activeTarget.type === "section" ? getSettingsSection(activeTarget.sectionId) : undefined;
  const SectionComponent = section?.Component;
  const activeWorkspace =
    activeTarget.type === "workspace"
      ? workspaces.find((workspace) => workspace.id === activeTarget.workspaceId)
      : undefined;

  return (
    <div className="flex h-screen min-h-0 w-full bg-background text-foreground">
      <SettingsSidebar
        activeTarget={activeTarget}
        workspaces={workspaces}
        onSelect={setActiveTarget}
        onBackToApp={() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            navigateTo("app");
          }
        }}
      />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="electrobun-webkit-app-region-drag absolute inset-x-0 top-0 z-20 h-8"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-8 pb-12 pt-10">
            {SectionComponent ? (
              <SectionComponent smokeBridge={smokeBridge} />
            ) : (
              <WorkspaceSettingsSection smokeBridge={smokeBridge} workspace={activeWorkspace} />
            )}
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-background via-background/80 to-transparent"
        />
      </main>
    </div>
  );
}
