import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./sections/registry.tsx";

const TRAFFIC_LIGHT_PAD_PX = 78;

interface SettingsSidebarProps {
  activeId: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  onBackToApp: () => void;
}

export function SettingsSidebar({ activeId, onSelect, onBackToApp }: SettingsSidebarProps) {
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
            className="h-7 gap-1 px-2 text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Back to app
          </Button>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pb-4 pt-2">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeId;
          const isDisabled = Boolean(section.disabled);
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                if (!isDisabled) {
                  onSelect(section.id);
                }
              }}
              disabled={isDisabled}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                isDisabled &&
                  "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-sidebar-foreground/60",
              )}
              aria-current={isActive ? "page" : undefined}
              aria-disabled={isDisabled}
            >
              <Icon className="size-4 shrink-0 opacity-80" />
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
