import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  type AppSpeedSetting,
  type DefaultSessionModeSetting,
  type GeneralSettings,
} from "../../../../shared/appSettings.ts";
import {
  getSmokeProviderLabel,
  SMOKE_PROVIDERS,
  type SmokeProvider,
} from "../../../../shared/providerModels.ts";
import { useAppSettingsStore } from "../../../state/appSettingsStore.ts";
import { SettingsGroup, SettingsRow } from "../components/SettingsRow.tsx";

export function GeneralSection() {
  const general = useAppSettingsStore((state) => state.settings.general);
  const updateGeneral = useAppSettingsStore((state) => state.updateGeneral);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold leading-tight">General</h2>
        <p className="text-sm text-muted-foreground">
          App-wide preferences for how open-acp behaves day to day.
        </p>
      </header>

      <SettingsGroup title="Defaults">
        <SettingsRow
          title="Default provider"
          description="Provider preselected when creating a new session."
          control={
            <ProviderSelect
              value={general.defaultProvider}
              onChange={(defaultProvider) => updateGeneral({ defaultProvider })}
            />
          }
        />
        <SettingsRow
          title="Default session mode"
          description="Build runs the agent normally; Plan asks it to draft a plan first."
          control={
            <SessionModeSelect
              value={general.defaultSessionMode}
              onChange={(defaultSessionMode) => updateGeneral({ defaultSessionMode })}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Composer">
        <SettingsRow
          title="Require ⌘ + enter to send long prompts"
          description="When enabled, multiline prompts require ⌘ + enter to send."
          control={
            <Switch
              checked={general.requireCmdEnterForLongPrompts}
              onCheckedChange={(checked: boolean) =>
                updateGeneral({ requireCmdEnterForLongPrompts: Boolean(checked) })
              }
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="System (coming soon)">
        <SettingsRow
          disabled
          title="Show in menu bar"
          description="Keep open-acp in the macOS menu bar when the main window is closed."
          control={<Switch checked={general.showInMenuBar} disabled />}
        />
        <SettingsRow
          disabled
          title="Prevent sleep while running"
          description="Keep your computer awake while open-acp is running a chat."
          control={<Switch checked={general.preventSleepWhileRunning} disabled />}
        />
        <SettingsRow
          disabled
          title="Speed"
          description="How quickly inference runs across chats."
          control={<SpeedSelect value={general.speed} onChange={() => {}} disabled />}
        />
      </SettingsGroup>
    </div>
  );
}

function ProviderSelect({
  value,
  onChange,
}: {
  value: SmokeProvider;
  onChange: (value: SmokeProvider) => void;
}) {
  return (
    <Select
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
  value,
  onChange,
}: {
  value: DefaultSessionModeSetting;
  onChange: (value: DefaultSessionModeSetting) => void;
}) {
  return (
    <Select
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

function SpeedSelect({
  value,
  onChange,
  disabled,
}: {
  value: GeneralSettings["speed"];
  onChange: (value: AppSpeedSetting) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === "standard" || next === "fast") {
          onChange(next);
        }
      }}
    >
      <SelectTrigger className="min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="standard">Standard</SelectItem>
        <SelectItem value="fast">Fast</SelectItem>
      </SelectContent>
    </Select>
  );
}
