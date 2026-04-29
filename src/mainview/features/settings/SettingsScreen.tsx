import { useState } from "react";
import { navigateTo } from "../../app/routeStore.ts";
import { SettingsSidebar } from "./SettingsSidebar.tsx";
import {
  DEFAULT_SETTINGS_SECTION_ID,
  getSettingsSection,
  type SettingsSectionId,
} from "./sections/registry.tsx";

export function SettingsScreen() {
  const [activeId, setActiveId] = useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION_ID);
  const section = getSettingsSection(activeId);
  const SectionComponent = section.Component;

  return (
    <div className="flex h-screen min-h-0 w-full bg-background text-foreground">
      <SettingsSidebar
        activeId={activeId}
        onSelect={setActiveId}
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
            <SectionComponent />
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
