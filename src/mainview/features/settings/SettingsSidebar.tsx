import { ChevronLeft, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "./sections/registry.tsx";
import type { WorkspaceSummary } from "../../../shared/workspaces.ts";
import {
  createSectionTarget,
  createWorkspaceTarget,
  isSameSettingsTarget,
  type SettingsTarget,
} from "./settingsTarget.ts";

const TRAFFIC_LIGHT_PAD_PX = 78;

interface SettingsSidebarProps {
  activeTarget: SettingsTarget;
  workspaces: WorkspaceSummary[];
  onSelect: (target: SettingsTarget) => void;
  onBackToApp: () => void;
}

export function SettingsSidebar({
  activeTarget,
  workspaces,
  onSelect,
  onBackToApp,
}: SettingsSidebarProps) {
  return (
    <aside className="flex w-[220px] flex-none flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div
        className="electrobun-webkit-app-region-drag flex items-center pr-3"
        style={
          {
            paddingLeft: TRAFFIC_LIGHT_PAD_PX,
            paddingTop: 12,
            paddingBottom: 8,
            WebkitAppRegion: "drag",
          } as React.CSSProperties
        }
      >
        <div
          className="electrobun-webkit-app-region-no-drag flex w-full items-center"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToApp}
            className="h-7 gap-1 px-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Back to app
          </Button>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pt-2">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          const target = createSectionTarget(section.id);
          const isActive = isSameSettingsTarget(activeTarget, target);
          const isDisabled = Boolean(section.disabled);
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                if (!isDisabled) {
                  onSelect(target);
                }
              }}
              disabled={isDisabled}
              className={getSidebarItemClassName(isActive, isDisabled)}
              aria-current={isActive ? "page" : undefined}
              aria-disabled={isDisabled}
            >
              <Icon className="size-4 shrink-0 opacity-80" />
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="min-h-6 flex-1" />
      <nav className="flex flex-col gap-1 px-2 pb-4" aria-label="Workspace settings">
        <div className="px-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/55">
          Workspaces
        </div>
        {workspaces.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-sidebar-foreground/45">No workspaces</div>
        ) : (
          workspaces.map((workspace) => {
            const target = createWorkspaceTarget(workspace.id);
            const isActive = isSameSettingsTarget(activeTarget, target);
            return (
              <button
                key={workspace.id}
                type="button"
                onClick={() => onSelect(target)}
                className={getSidebarItemClassName(isActive)}
                aria-current={isActive ? "page" : undefined}
              >
                <Folder className="size-4 shrink-0 opacity-80" />
                <span className="truncate">{workspace.name}</span>
              </button>
            );
          })
        )}
      </nav>
    </aside>
  );
}

function getSidebarItemClassName(isActive: boolean, isDisabled = false): string {
  return cn(
    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
    isDisabled &&
      "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-sidebar-foreground/60",
  );
}
