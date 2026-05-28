import React from "react";
import { cn } from "@/lib/utils";
import type { SmokeProvider } from "../../shared/providerModels.ts";
import { getSmokeProviderLabel } from "../../shared/providerModels.ts";
import claudeIconDark from "../assets/agents/claude-icon-dark.svg";
import claudeIconLight from "../assets/agents/claude-icon-light.svg";
import codexIconDark from "../assets/agents/codex-icon-dark.svg";
import codexIconLight from "../assets/agents/codex-icon-light.svg";
import cursorIconDark from "../assets/agents/cursor-icon-dark.svg";
import cursorIconLight from "../assets/agents/cursor-icon-light.svg";
import opencodeIconDark from "../assets/agents/opencode-logo-dark.svg";
import opencodeIconLight from "../assets/agents/opencode-logo-light.svg";
import qwenLogo from "../assets/agents/qwen-logo.svg";

interface ProviderIconProps {
  provider: SmokeProvider;
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}

interface ProviderOptionLabelProps {
  provider: SmokeProvider;
  iconSize?: number;
  className?: string;
  labelClassName?: string;
}

export function ProviderIcon({
  provider,
  size = 16,
  className,
  "aria-hidden": ariaHidden = true,
}: ProviderIconProps): React.ReactNode {
  const label = getSmokeProviderLabel(provider);
  const icon = getProviderIconAsset(provider);
  const style = { width: size, height: size };

  return (
    <span
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : label}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      role={ariaHidden ? undefined : "img"}
      style={style}
    >
      <img alt="" className="block size-full object-contain dark:hidden" src={icon.light} />
      <img alt="" className="hidden size-full object-contain dark:block" src={icon.dark} />
    </span>
  );
}

export function ProviderOptionLabel({
  provider,
  iconSize = 16,
  className,
  labelClassName,
}: ProviderOptionLabelProps): React.ReactNode {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <ProviderIcon provider={provider} size={iconSize} />
      <span className={cn("truncate", labelClassName)}>{getSmokeProviderLabel(provider)}</span>
    </span>
  );
}

function getProviderIconAsset(provider: SmokeProvider): { light: string; dark: string } {
  switch (provider) {
    case "codex":
      return { light: codexIconLight, dark: codexIconDark };
    case "cursor":
      return { light: cursorIconLight, dark: cursorIconDark };
    case "claude":
      return { light: claudeIconLight, dark: claudeIconDark };
    case "qwen":
      return { light: qwenLogo, dark: qwenLogo };
    case "opencode":
      return { light: opencodeIconLight, dark: opencodeIconDark };
  }
}
