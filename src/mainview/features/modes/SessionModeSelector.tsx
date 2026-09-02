import React from "react";
import { Button } from "@/components/ui/button";
import type { NormalizedSessionMode } from "../../../shared/AppRPC.ts";
import { getNormalizedSessionModeLabel } from "../../../shared/sessionModes.ts";

interface SessionModeSelectorProps {
  value: NormalizedSessionMode;
  pendingValue?: NormalizedSessionMode;
  disabled?: boolean;
  planDisabled?: boolean;
  onChange: (mode: NormalizedSessionMode) => void;
}

export function SessionModeSelector({
  value,
  pendingValue,
  disabled,
  planDisabled,
  onChange,
}: SessionModeSelectorProps): React.ReactNode {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1"
      data-testid="session-mode-selector"
    >
      {(["build", "plan"] as const).map((mode) => {
        const isSelected = value === mode;
        const isPending = pendingValue === mode;
        return (
          <Button
            aria-pressed={isSelected}
            className="rounded-full"
            data-session-mode={mode}
            disabled={disabled || (mode === "plan" && planDisabled)}
            key={mode}
            onClick={() => onChange(mode)}
            size="sm"
            type="button"
            variant={isSelected ? "secondary" : "ghost"}
          >
            {isPending
              ? `${getNormalizedSessionModeLabel(mode)}...`
              : getNormalizedSessionModeLabel(mode)}
          </Button>
        );
      })}
    </div>
  );
}
