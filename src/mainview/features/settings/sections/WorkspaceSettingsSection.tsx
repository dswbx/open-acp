import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DefaultSessionModeSetting } from "../../../../shared/appSettings.ts";
import {
  getSmokeProviderLabel,
  SMOKE_PROVIDERS,
  type SmokeProvider,
} from "../../../../shared/providerModels.ts";
import type { WorkspaceSummary } from "../../../../shared/workspaces.ts";
import type { SmokeBridge } from "../../../bridge/SmokeBridge.ts";
import { useWorkspaceStore } from "../../../state/workspaceStore.ts";
import { SettingsGroup, SettingsRow } from "../components/SettingsRow.tsx";

interface WorkspaceSettingsSectionProps {
  workspace?: WorkspaceSummary;
  smokeBridge?: SmokeBridge;
}

export function WorkspaceSettingsSection({
  workspace,
  smokeBridge,
}: WorkspaceSettingsSectionProps) {
  const [name, setName] = useState(workspace?.name ?? "");
  const [rootPath, setRootPath] = useState(workspace?.rootPath ?? "");
  const [defaultProvider, setDefaultProvider] = useState<SmokeProvider>(
    workspace?.defaultProvider ?? "codex",
  );
  const [defaultSessionMode, setDefaultSessionMode] = useState<DefaultSessionModeSetting>(
    workspace?.defaultSessionMode ?? "build",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isChoosingDirectory, setIsChoosingDirectory] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    setName(workspace?.name ?? "");
    setRootPath(workspace?.rootPath ?? "");
    setDefaultProvider(workspace?.defaultProvider ?? "codex");
    setDefaultSessionMode(workspace?.defaultSessionMode ?? "build");
    setErrorMessage(undefined);
    setIsSaving(false);
    setIsChoosingDirectory(false);
  }, [workspace]);

  const isDirty = useMemo(() => {
    if (!workspace) return false;
    return (
      name !== workspace.name ||
      rootPath !== workspace.rootPath ||
      defaultProvider !== workspace.defaultProvider ||
      defaultSessionMode !== workspace.defaultSessionMode
    );
  }, [defaultProvider, defaultSessionMode, name, rootPath, workspace]);

  const canSave =
    Boolean(workspace) &&
    Boolean(smokeBridge?.isAvailable()) &&
    isDirty &&
    name.trim().length > 0 &&
    rootPath.trim().length > 0 &&
    !isSaving;

  if (!workspace) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold leading-tight">Workspace not found</h2>
          <p className="text-sm text-muted-foreground">
            Select another workspace from the sidebar.
          </p>
        </header>
      </div>
    );
  }

  async function handleChooseDirectory(): Promise<void> {
    if (!workspace || !smokeBridge?.isAvailable() || isChoosingDirectory) return;
    setIsChoosingDirectory(true);
    setErrorMessage(undefined);
    try {
      const result = await smokeBridge.chooseWorkingDirectory(
        rootPath.trim() || workspace.rootPath,
      );
      const trimmed = result.path?.trim();
      if (trimmed) setRootPath(trimmed);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to choose root path.");
    } finally {
      setIsChoosingDirectory(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!workspace || !smokeBridge?.isAvailable() || !canSave) return;
    setIsSaving(true);
    setErrorMessage(undefined);
    try {
      const result = await smokeBridge.updateWorkspaceSettings({
        workspaceId: workspace.id,
        name: name.trim(),
        rootPath: rootPath.trim(),
        defaultProvider,
        defaultSessionMode,
      });
      useWorkspaceStore.getState().upsertWorkspace(result.workspace);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save workspace settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold leading-tight">{workspace.name}</h2>
        <p className="text-sm text-muted-foreground">
          Defaults used when starting new sessions from this workspace.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <CompactMetadata label="ID" value={workspace.id} />
          <CompactMetadata label="Root" value={workspace.rootPath} />
          <CompactMetadata label="Settings" value={workspace.settingsPath} />
          <CompactMetadata label="Sessions" value={workspace.sessionsPath} />
          <CompactMetadata label="Created" value={workspace.createdAt} />
          <CompactMetadata label="Updated" value={workspace.updatedAt} />
        </dl>
      </section>

      <SettingsGroup
        title="Defaults"
        description="These values prefill the new-session dialog when this workspace is selected."
      >
        <SettingsRow
          title="Name"
          description="Display name in the workspace list and settings sidebar."
          control={
            <Input
              className="w-64"
              disabled={isSaving}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          }
        />
        <SettingsRow
          title="Root path"
          description="Working directory used for new sessions in this workspace."
          control={
            <div className="flex items-center gap-2">
              <Input
                className="w-72 font-mono text-xs"
                disabled={isSaving}
                onChange={(event) => setRootPath(event.target.value)}
                spellCheck={false}
                value={rootPath}
              />
              <Button
                disabled={isSaving || isChoosingDirectory || !smokeBridge?.isAvailable()}
                onClick={() => {
                  void handleChooseDirectory();
                }}
                type="button"
                variant="outline"
              >
                {isChoosingDirectory ? "Choosing..." : "Choose..."}
              </Button>
            </div>
          }
        />
        <SettingsRow
          title="Default provider"
          description="Provider preselected when creating a session here."
          control={
            <ProviderSelect
              disabled={isSaving}
              onChange={setDefaultProvider}
              value={defaultProvider}
            />
          }
        />
        <SettingsRow
          title="Default mode"
          description="Build starts normally; Plan asks for a plan first."
          control={
            <SessionModeSelect
              disabled={isSaving}
              onChange={setDefaultSessionMode}
              value={defaultSessionMode}
            />
          }
        />
        <SettingsRow
          title="Save changes"
          description={
            errorMessage ??
            (!smokeBridge?.isAvailable()
              ? "Workspace settings can only be saved in the desktop runtime."
              : "Updates are stored with this workspace.")
          }
          control={
            <Button disabled={!canSave} onClick={() => void handleSave()}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          }
        />
      </SettingsGroup>
    </div>
  );
}

function CompactMetadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ProviderSelect({
  disabled,
  value,
  onChange,
}: {
  disabled?: boolean;
  value: SmokeProvider;
  onChange: (value: SmokeProvider) => void;
}) {
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(next) => {
        if (next && (SMOKE_PROVIDERS as readonly string[]).includes(next)) {
          onChange(next as SmokeProvider);
        }
      }}
    >
      <SelectTrigger className="min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SMOKE_PROVIDERS.map((provider) => (
          <SelectItem key={provider} value={provider}>
            {getSmokeProviderLabel(provider)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SessionModeSelect({
  disabled,
  value,
  onChange,
}: {
  disabled?: boolean;
  value: DefaultSessionModeSetting;
  onChange: (value: DefaultSessionModeSetting) => void;
}) {
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(next) => {
        if (next === "build" || next === "plan") {
          onChange(next);
        }
      }}
    >
      <SelectTrigger className="min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="build">Build</SelectItem>
        <SelectItem value="plan">Plan</SelectItem>
      </SelectContent>
    </Select>
  );
}
