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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SmokeProvider } from "../../shared/AppRPC.ts";

interface NewSessionDialogProps {
  open: boolean;
  provider: SmokeProvider;
  cwd: string;
  isCreating: boolean;
  isChoosingWorkingDirectory: boolean;
  onOpenChange: (open: boolean) => void;
  onProviderChange: (provider: SmokeProvider) => void;
  onCwdChange: (cwd: string) => void;
  onChooseWorkingDirectory: () => void;
  onSubmit: () => void;
}

function getProviderLabel(provider: SmokeProvider): string {
  return provider === "codex"
    ? "Codex"
    : provider === "claude"
      ? "Claude"
      : "OpenCode";
}

export const NewSessionDialog = ({
  open,
  provider,
  cwd,
  isCreating,
  isChoosingWorkingDirectory,
  onOpenChange,
  onProviderChange,
  onCwdChange,
  onChooseWorkingDirectory,
  onSubmit,
}: NewSessionDialogProps): React.ReactNode => {
  const normalizedCwd = cwd.trim();
  const canSubmit =
    normalizedCwd.length > 0 && !isCreating && !isChoosingWorkingDirectory;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Provider
            </span>
            <Select
              disabled={isCreating}
              onValueChange={(value) => onProviderChange(value as SmokeProvider)}
              value={provider}
            >
              <SelectTrigger aria-label="Provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(["codex", "claude", "opencode"] as const).map((option) => (
                    <SelectItem key={option} value={option}>
                      {getProviderLabel(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Working Directory
            </span>
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                disabled={isCreating || isChoosingWorkingDirectory}
                onChange={(event) => onCwdChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSubmit) {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder="/path/to/project"
                spellCheck={false}
                value={cwd}
              />
              <Button
                disabled={isCreating || isChoosingWorkingDirectory}
                onClick={onChooseWorkingDirectory}
                type="button"
                variant="outline"
              >
                {isChoosingWorkingDirectory ? "Choosing..." : "Choose..."}
              </Button>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button
            disabled={isCreating || isChoosingWorkingDirectory}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} type="button">
            {isCreating ? "Creating..." : "Create session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
