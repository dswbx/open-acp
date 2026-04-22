import React from "react";
import { FileText, FolderGit2, FolderTree, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type RightSidebarTabType = "inspector" | "files" | "git";

interface RightSidebarTabsProps {
  activeTab: RightSidebarTabType;
  openTabs: readonly RightSidebarTabType[];
  onActiveTabChange: (tab: RightSidebarTabType) => void;
  onOpenTab: (tab: RightSidebarTabType) => void;
  onCloseTab: (tab: RightSidebarTabType) => void;
  tabContent: Record<RightSidebarTabType, React.ReactNode>;
}

const TAB_META: Record<
  RightSidebarTabType,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }
> = {
  inspector: {
    icon: FileText,
    label: "Inspector",
  },
  files: {
    icon: FolderTree,
    label: "Files",
  },
  git: {
    icon: FolderGit2,
    label: "Git",
  },
};

const ALL_TAB_TYPES = Object.keys(TAB_META) as RightSidebarTabType[];

export function RightSidebarTabs({
  activeTab,
  openTabs,
  onActiveTabChange,
  onOpenTab,
  onCloseTab,
  tabContent,
}: RightSidebarTabsProps): React.ReactNode {
  const addableTabs = ALL_TAB_TYPES.filter((tab) => !openTabs.includes(tab));

  return (
    <Tabs
      className="flex h-full min-h-0 flex-col gap-3 px-2 pt-2"
      onValueChange={(value) => {
        if (value === "inspector" || value === "files" || value === "git") {
          onActiveTabChange(value);
        }
      }}
      value={activeTab}
    >
      <div className="flex items-center justify-between gap-2">
        <TabsList className="min-w-0 bg-transparent p-0" variant="line">
          {openTabs.map((tab) => {
            const Icon = TAB_META[tab].icon;
            return (
              <TabsTrigger className="group tracking-normal border-none" key={tab} value={tab}>
                <Button
                  className="group/sidebar-tab"
                  variant={activeTab === tab ? "secondary" : "ghost"}
                >
                  <div className="relative size-3.5 text-muted-foreground">
                    <Icon className="absolute inset-0 size-3.5 transition-opacity group-hover/sidebar-tab:opacity-0" />
                    <span
                      className="absolute inset-0 z-10 flex items-center justify-center opacity-0 pointer-events-none transition-opacity group-hover/sidebar-tab:opacity-100 group-hover/sidebar-tab:pointer-events-auto"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseTab(tab);
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      role="button"
                      tabIndex={-1}
                    >
                      <X className="size-3" />
                    </span>
                  </div>
                  {TAB_META[tab].label}
                </Button>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon" variant="ghost" />}>
            <Plus className="size-4" />
            <span className="sr-only">Open sidebar tab</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {addableTabs.length === 0 ? (
              <DropdownMenuItem disabled>All tabs open</DropdownMenuItem>
            ) : (
              addableTabs.map((tab) => {
                const Icon = TAB_META[tab].icon;
                return (
                  <DropdownMenuItem
                    key={tab}
                    onClick={() => {
                      onOpenTab(tab);
                    }}
                  >
                    <Icon className="size-4" />
                    {TAB_META[tab].label}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {openTabs.map((tab) => (
        <TabsContent className="flex min-h-0 flex-1 flex-col overflow-hidden" key={tab} value={tab}>
          {tabContent[tab]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
