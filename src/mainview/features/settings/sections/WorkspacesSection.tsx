import { useEffect } from "react";
import type { SmokeBridge } from "../../../bridge/SmokeBridge.ts";
import { useWorkspaceStore } from "../../../state/workspaceStore.ts";
import { SettingsGroup, SettingsRow } from "../components/SettingsRow.tsx";

export function WorkspacesSection({ smokeBridge }: { smokeBridge?: SmokeBridge }) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  useEffect(() => {
    if (!smokeBridge?.isAvailable()) return;
    let cancelled = false;
    void smokeBridge.listWorkspaces().then((result) => {
      if (!cancelled) {
        useWorkspaceStore.getState().setWorkspaces(result.workspaces);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [smokeBridge]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold leading-tight">Workspaces</h2>
        <p className="text-sm text-muted-foreground">
          Workspace folders and their open-acp storage locations.
        </p>
      </header>

      <SettingsGroup title="Created workspaces">
        {workspaces.length === 0 ? (
          <SettingsRow
            title="No workspaces"
            description="Create a workspace from the main sidebar to show it here."
            control={null}
          />
        ) : (
          workspaces.map((workspace) => (
            <SettingsRow
              key={workspace.id}
              title={workspace.name}
              description={`${workspace.rootPath} | ${workspace.settingsPath}`}
              control={<span className="text-sm text-muted-foreground">{workspace.id}</span>}
            />
          ))
        )}
      </SettingsGroup>
    </div>
  );
}
