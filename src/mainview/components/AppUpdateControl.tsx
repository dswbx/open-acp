import React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AppUpdateState } from "../../shared/AppRPC.ts";

interface AppUpdateControlProps {
  state: AppUpdateState;
  onCheck: () => void;
  onApply: () => void;
}

function getDownloadLabel(state: AppUpdateState): string {
  if (typeof state.progressPercent === "number") {
    return `Downloading update (${state.progressPercent}%)`;
  }
  return "Downloading update";
}

export function AppUpdateControl({
  state,
  onCheck,
  onApply,
}: AppUpdateControlProps): React.ReactElement | null {
  if (!state.availability.supported) {
    return null;
  }

  if (state.status === "ready_to_restart" && state.canApply) {
    return (
      <Button onClick={onApply} size="sm" variant="secondary">
        Restart to update
      </Button>
    );
  }

  if (state.status === "checking" || state.status === "downloading") {
    return (
      <Button disabled size="sm" variant="outline">
        <Spinner className="size-3.5" />
        {state.status === "checking" ? "Checking for updates" : getDownloadLabel(state)}
      </Button>
    );
  }

  if (state.status === "error") {
    return (
      <Button onClick={onCheck} size="sm" variant="destructive">
        <RefreshCw />
        Retry update
      </Button>
    );
  }

  return (
    <Button onClick={onCheck} size="sm" variant="outline">
      <RefreshCw />
      {state.status === "up_to_date" ? "Up to date" : "Check for updates"}
    </Button>
  );
}
