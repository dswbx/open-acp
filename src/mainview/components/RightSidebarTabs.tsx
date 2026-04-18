import React from "react";
import { FileText, FolderGit2, FolderTree, Plus } from "lucide-react";
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
   tabContent,
}: RightSidebarTabsProps): React.ReactNode {
   const addableTabs = ALL_TAB_TYPES.filter((tab) => !openTabs.includes(tab));

   return (
      <Tabs
         className="min-h-0 gap-3"
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
                     <TabsTrigger
                        className="flex-none gap-2 rounded-md px-3 py-1.5 text-xs uppercase tracking-[0.18em]"
                        key={tab}
                        value={tab}
                     >
                        <Icon className="size-3.5" />
                        {TAB_META[tab].label}
                     </TabsTrigger>
                  );
               })}
            </TabsList>

            <DropdownMenu>
               <DropdownMenuTrigger render={<Button size="icon" variant="outline" />}>
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
            <TabsContent className="min-h-0" key={tab} value={tab}>
               {tabContent[tab]}
            </TabsContent>
         ))}
      </Tabs>
   );
}
