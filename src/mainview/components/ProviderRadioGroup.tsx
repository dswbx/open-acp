import React from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { SmokeProvider } from "../../shared/AppRPC.ts";
import { getSmokeProviderLabel, SMOKE_PROVIDERS } from "../../shared/providerModels.ts";
import { ProviderOptionLabel } from "../../ui/components/ProviderIcon.tsx";

interface ProviderRadioGroupProps {
  value: SmokeProvider;
  disabled?: boolean;
  onChange: (provider: SmokeProvider) => void;
}

export function ProviderRadioGroup({
  value,
  disabled,
  onChange,
}: ProviderRadioGroupProps): React.ReactNode {
  return (
    <RadioGroup
      className="grid grid-cols-2 gap-2"
      disabled={disabled}
      onValueChange={(next) => onChange(next as SmokeProvider)}
      value={value}
    >
      {SMOKE_PROVIDERS.map((option) => (
        <RadioGroupItem
          aria-label={getSmokeProviderLabel(option)}
          className="h-20 w-full justify-center"
          key={option}
          value={option}
        >
          <ProviderOptionLabel
            className="flex-col gap-1.5"
            iconSize={28}
            labelClassName="text-base"
            provider={option}
          />
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}
