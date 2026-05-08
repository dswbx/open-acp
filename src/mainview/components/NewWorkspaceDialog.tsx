import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { NormalizedSessionMode, SmokeProvider } from "../../shared/AppRPC.ts";
import { getSmokeProviderLabel, SMOKE_PROVIDERS } from "../../shared/providerModels.ts";
import { SessionModeSelector } from "../features/modes/index.ts";

interface NewWorkspaceDialogProps {
  open: boolean;
  name: string;
  rootPath: string;
  provider: SmokeProvider;
  mode: NormalizedSessionMode;
  supportsPlanMode: boolean;
  isCreating: boolean;
  isChoosingDirectory: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onRootPathChange: (rootPath: string) => void;
  onProviderChange: (provider: SmokeProvider) => void;
  onModeChange: (mode: NormalizedSessionMode) => void;
  onChooseDirectory: () => void;
  onSubmit: () => void;
}

export function NewWorkspaceDialog({
  open,
  name,
  rootPath,
  provider,
  mode,
  supportsPlanMode,
  isCreating,
  isChoosingDirectory,
  onOpenChange,
  onNameChange,
  onRootPathChange,
  onProviderChange,
  onModeChange,
  onChooseDirectory,
  onSubmit,
}: NewWorkspaceDialogProps): React.ReactNode {
  const canSubmit = name.trim().length > 0 && rootPath.trim().length > 0 && !isCreating;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Workspace</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </span>
            <Input
              autoFocus
              disabled={isCreating}
              onChange={(event) => onNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Give it a name"
              value={name}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Folder
            </span>
            <div className="flex items-center gap-2">
              <Input
                disabled={isCreating || isChoosingDirectory}
                onChange={(event) => onRootPathChange(event.target.value)}
                placeholder="/path/to/project"
                spellCheck={false}
                value={rootPath}
              />
              <Button
                disabled={isCreating || isChoosingDirectory}
                onClick={onChooseDirectory}
                type="button"
                variant="outline"
              >
                {isChoosingDirectory ? "Choosing..." : "Choose..."}
              </Button>
            </div>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Default provider
            </span>
            <RadioGroup
              className="grid grid-cols-2 gap-2"
              disabled={isCreating}
              onValueChange={(value) => onProviderChange(value as SmokeProvider)}
              value={provider}
            >
              {SMOKE_PROVIDERS.map((option) => (
                <RadioGroupItem
                  aria-label={getSmokeProviderLabel(option)}
                  className="w-full justify-center"
                  key={option}
                  value={option}
                >
                  <span className="truncate">{getSmokeProviderLabel(option)}</span>
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mode
            </span>
            <SessionModeSelector
              disabled={isCreating}
              onChange={onModeChange}
              planDisabled={!supportsPlanMode}
              value={mode}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={isCreating} onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit}>
            {isCreating ? "Creating..." : "Create workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
