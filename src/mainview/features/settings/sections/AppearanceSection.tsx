import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  APPEARANCE_CONTRAST_MAX,
  APPEARANCE_CONTRAST_MIN,
  type ThemePreferenceSetting,
} from "../../../../shared/appSettings.ts";
import { useAppSettingsStore } from "../../../state/appSettingsStore.ts";
import { SettingsGroup, SettingsRow } from "../components/SettingsRow.tsx";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreferenceSetting; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function AppearanceSection() {
  const appearance = useAppSettingsStore((state) => state.settings.appearance);
  const updateAppearance = useAppSettingsStore((state) => state.updateAppearance);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold leading-tight">Appearance</h2>
        <p className="text-muted-foreground">Use light, dark, or match your system.</p>
      </header>

      <SettingsGroup title="Theme">
        <SettingsRow
          title="Theme"
          description="Use light, dark, or match your system."
          control={
            <RadioGroup
              value={appearance.themePreference}
              onValueChange={(next: string | null) => {
                if (next === "light" || next === "dark" || next === "system") {
                  updateAppearance({ themePreference: next });
                }
              }}
            >
              {THEME_OPTIONS.map((option) => (
                <RadioGroupItem key={option.value} value={option.value}>
                  {option.label}
                </RadioGroupItem>
              ))}
            </RadioGroup>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Sidebar (coming soon)">
        <SettingsRow
          disabled
          title="Translucent sidebar"
          description="Use the native macOS vibrancy effect on the sidebar. Currently configured at app launch only."
          control={<Switch checked={appearance.translucentSidebar} disabled />}
        />
        <SettingsRow
          disabled
          title="Contrast"
          description="Tune contrast for theme tokens. The runtime theme engine that consumes this is not yet built."
          control={
            <input
              type="range"
              min={APPEARANCE_CONTRAST_MIN}
              max={APPEARANCE_CONTRAST_MAX}
              value={appearance.contrast}
              disabled
              readOnly
              className="h-2 w-40 cursor-not-allowed appearance-none rounded-full bg-muted accent-primary opacity-60"
              aria-label="Contrast"
            />
          }
        />
      </SettingsGroup>
    </div>
  );
}
