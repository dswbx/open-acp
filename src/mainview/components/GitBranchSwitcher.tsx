import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChevronDown, GitBranch, Loader2, TriangleAlert } from "lucide-react";
import type { GetGitStatusResult, GitBranchEntry } from "../../shared/AppRPC.ts";
import type { SmokeBridge } from "../bridge/SmokeBridge.ts";

interface GitBranchSwitcherProps {
  cwd?: string;
  gitStatus?: GetGitStatusResult;
  smokeBridge: SmokeBridge;
  onBranchSwitched?: (cwd: string) => Promise<void>;
  size?: "xs" | "sm";
  className?: string;
}

function getGitBranchLabel(status?: GetGitStatusResult): string | undefined {
  if (!status?.isGitRepository) {
    return undefined;
  }

  return status.branch ?? `detached @ ${status.head ?? "HEAD"}`;
}

export function GitBranchSwitcher({
  cwd,
  gitStatus,
  smokeBridge,
  onBranchSwitched,
  size = "sm",
  className,
}: GitBranchSwitcherProps): React.ReactNode {
  const [branches, setBranches] = React.useState<GitBranchEntry[]>([]);
  const [branchListError, setBranchListError] = React.useState<string>();
  const [isBranchMenuOpen, setIsBranchMenuOpen] = React.useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = React.useState(false);
  const [confirmBranch, setConfirmBranch] = React.useState<string>();
  const [switchError, setSwitchError] = React.useState<string>();
  const [isSwitching, setIsSwitching] = React.useState(false);
  const branchRequestIdRef = React.useRef(0);

  const trimmedCwd = cwd?.trim();
  const branchLabel = getGitBranchLabel(gitStatus);
  const canSwitchBranches =
    Boolean(trimmedCwd) && Boolean(gitStatus?.isGitRepository) && smokeBridge.isAvailable();
  const iconButtonSize = size === "xs" ? "icon-xs" : "icon-sm";

  React.useEffect(() => {
    setBranches([]);
    setBranchListError(undefined);
    setIsBranchMenuOpen(false);
    setIsLoadingBranches(false);
    setConfirmBranch(undefined);
    setSwitchError(undefined);
    setIsSwitching(false);
  }, [trimmedCwd, gitStatus?.branch, gitStatus?.head, gitStatus?.isGitRepository]);

  const loadBranches = React.useCallback(
    async (force = false) => {
      if (!canSwitchBranches || !trimmedCwd) {
        return;
      }

      if (!force && branches.length > 0) {
        return;
      }

      branchRequestIdRef.current += 1;
      const requestId = branchRequestIdRef.current;
      setIsLoadingBranches(true);
      setBranchListError(undefined);

      try {
        const result = await smokeBridge.getGitBranches(trimmedCwd);
        if (branchRequestIdRef.current !== requestId) {
          return;
        }
        setBranches(result.branches);
        setBranchListError(undefined);
      } catch (error) {
        if (branchRequestIdRef.current !== requestId) {
          return;
        }
        setBranches([]);
        setBranchListError(error instanceof Error ? error.message : "Failed to load branches.");
      } finally {
        if (branchRequestIdRef.current === requestId) {
          setIsLoadingBranches(false);
        }
      }
    },
    [branches.length, canSwitchBranches, smokeBridge, trimmedCwd],
  );

  const handleConfirmSwitch = React.useCallback(async () => {
    if (!trimmedCwd || !confirmBranch) {
      return;
    }

    setIsSwitching(true);
    setSwitchError(undefined);

    try {
      await smokeBridge.switchGitBranch(trimmedCwd, confirmBranch);
      setBranches([]);
      setBranchListError(undefined);
      await onBranchSwitched?.(trimmedCwd);
      setConfirmBranch(undefined);
    } catch (error) {
      setSwitchError(
        error instanceof Error ? error.message : `Failed to switch to "${confirmBranch}".`,
      );
    } finally {
      setIsSwitching(false);
    }
  }, [confirmBranch, onBranchSwitched, smokeBridge, trimmedCwd]);

  if (!branchLabel) {
    return null;
  }

  return (
    <>
      <div className={cn("min-w-0", className)}>
        <ButtonGroup className="max-w-full">
          <Button
            className="max-w-[18rem] justify-start overflow-hidden"
            size={size}
            tabIndex={-1}
            type="button"
            variant="outline"
          >
            <GitBranch data-icon="inline-start" />
            <span className="truncate">{branchLabel}</span>
          </Button>
          <DropdownMenu
            onOpenChange={(open) => {
              setIsBranchMenuOpen(open);
              if (open) {
                void loadBranches();
              }
            }}
            open={isBranchMenuOpen}
          >
            <DropdownMenuTrigger
              disabled={!canSwitchBranches || isSwitching}
              render={
                <Button
                  aria-label="Switch branch"
                  size={iconButtonSize}
                  type="button"
                  variant="outline"
                />
              }
            >
              {isLoadingBranches ? <Loader2 className="animate-spin" /> : <ChevronDown />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Local branches</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {branchListError ? (
                  <DropdownMenuItem disabled>{branchListError}</DropdownMenuItem>
                ) : branches.length === 0 ? (
                  <DropdownMenuItem disabled>
                    {isLoadingBranches ? "Loading branches..." : "No local branches found."}
                  </DropdownMenuItem>
                ) : (
                  branches.map((branch) => (
                    <DropdownMenuItem
                      disabled={branch.isCurrent}
                      key={branch.name}
                      onClick={() => {
                        setSwitchError(undefined);
                        setConfirmBranch(branch.name);
                      }}
                    >
                      <span className="truncate">{branch.name}</span>
                      {branch.isCurrent ? (
                        <span className="ml-auto text-xs text-muted-foreground">Current</span>
                      ) : null}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !isSwitching) {
            setConfirmBranch(undefined);
            setSwitchError(undefined);
          }
        }}
        open={confirmBranch != null}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch branch?</DialogTitle>
            <DialogDescription>
              Switch this repository to <span className="font-medium">{confirmBranch}</span>. Git
              may refuse if the working tree has changes that would be overwritten.
            </DialogDescription>
          </DialogHeader>

          {switchError ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Could not switch branches</AlertTitle>
              <AlertDescription>{switchError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              disabled={isSwitching}
              onClick={() => {
                setConfirmBranch(undefined);
                setSwitchError(undefined);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSwitching} onClick={() => void handleConfirmSwitch()} type="button">
              {isSwitching ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {isSwitching ? "Switching..." : "Switch branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
