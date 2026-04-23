import React from "react";
import { Switch } from "@/components/ui/switch";
import type { NormalizedSessionMode } from "../../../shared/AppRPC.ts";

interface ComposerModeToggleProps {
  value: NormalizedSessionMode;
  pendingValue?: NormalizedSessionMode;
  disabled?: boolean;
  planDisabled?: boolean;
  onChange: (mode: NormalizedSessionMode) => void;
}

export function ComposerModeToggle({
  value,
  pendingValue,
  disabled,
  planDisabled,
  onChange,
}: ComposerModeToggleProps): React.ReactNode {
  const checked = value === "plan";
  const isPending = pendingValue !== undefined;
  const nextMode = checked ? "build" : "plan";
  const isDisabled = disabled || (!checked && planDisabled);
  const visibleValue = pendingValue ?? value;

  return (
    <label
      className="flex items-center gap-3 rounded-full border border-border bg-muted/20 px-3 py-2"
      data-testid="composer-mode-toggle"
    >
      <div className="flex flex-col leading-none">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Plan mode
        </span>
        <span className="text-sm font-medium text-foreground">
          {isPending ? `Switching to ${visibleValue}...` : visibleValue === "plan" ? "On" : "Off"}
        </span>
      </div>
      <Switch
        aria-label="Plan mode"
        checked={checked}
        disabled={isDisabled}
        onCheckedChange={() => onChange(nextMode)}
        size="default"
      />
    </label>
  );
}
