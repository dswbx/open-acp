import React from "react";
import type { NormalizedSessionMode } from "../../../shared/AppRPC.ts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  return (
    <Button
      aria-label="Plan mode"
      data-testid="composer-mode-toggle"
      variant={checked ? "default" : "ghost"}
      data-checked={checked}
      className={cn("rounded-full", checked ? "" : "text-muted-foreground")}
      onClick={() => onChange(nextMode)}
      disabled={isDisabled || isPending}
    >
      Plan
    </Button>
  );
}
