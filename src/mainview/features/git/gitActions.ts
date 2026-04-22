import type { GetGitStatusResult } from "../../../shared/AppRPC.ts";
import type { SmokeBridge } from "../../bridge/SmokeBridge.ts";
import { useRightSidebarStore } from "../../state/rightSidebarStore.ts";
import { useSessionStore } from "../../state/sessionStore.ts";
import {
  calculateGitDiffLineTotals,
  formatGitSessionSummary,
  getGitBranchLabel,
} from "./gitPresentation.ts";
import { useGitStore } from "./state/gitStore.ts";

function syncSessionGitMetadata(cwd: string, status: GetGitStatusResult): void {
  useSessionStore.getState().setSessions((previousSessions) =>
    previousSessions.map((session) =>
      session.cwd === cwd
        ? {
            ...session,
            gitBranch: getGitBranchLabel(status),
            gitStatusSummary: formatGitSessionSummary(status),
          }
        : session,
    ),
  );
}

export function reconcileGitTabForActiveSession(gitAutoOpenedSessions: Set<string>): boolean {
  const activeSessionId = useSessionStore.getState().activeSessionId;
  const activeSession = useSessionStore
    .getState()
    .sessions.find((session) => session.id === activeSessionId);
  const activeCwd = activeSession?.cwd;
  if (!activeSessionId || !activeCwd || gitAutoOpenedSessions.has(activeSessionId)) {
    return false;
  }

  const gitStatus = useGitStore.getState().statusByCwd[activeCwd];
  if (!gitStatus?.isGitRepository) {
    return false;
  }

  gitAutoOpenedSessions.add(activeSessionId);
  if (!useRightSidebarStore.getState().openTabs.includes("git")) {
    useRightSidebarStore.getState().openTab("git");
  }
  return true;
}

export async function hydrateGitDiffTotals(
  bridge: SmokeBridge,
  cwd?: string,
  options?: { force?: boolean; status?: GetGitStatusResult },
): Promise<void> {
  const trimmedCwd = cwd?.trim();
  if (!trimmedCwd || !bridge.isAvailable()) return;

  const gitState = useGitStore.getState();
  const status = options?.status ?? gitState.statusByCwd[trimmedCwd];

  if (status && (!status.isGitRepository || status.files.length === 0)) {
    gitState.clearDiffTotals(trimmedCwd);
    return;
  }

  if (gitState.diffTotalsLoadingByCwd[trimmedCwd]) {
    return;
  }

  if (!options?.force && gitState.diffTotalsByCwd[trimmedCwd]) {
    return;
  }

  gitState.beginDiffTotalsLoad(trimmedCwd);

  try {
    const result = await bridge.getGitDiff(trimmedCwd);
    if (!result.isGitRepository || result.files.length === 0) {
      useGitStore.getState().clearDiffTotals(trimmedCwd);
      return;
    }

    useGitStore.getState().completeDiffTotalsLoad(trimmedCwd, calculateGitDiffLineTotals(result));
  } catch (error) {
    useGitStore
      .getState()
      .failDiffTotalsLoad(
        trimmedCwd,
        error instanceof Error ? error.message : "Failed to load git diff totals.",
      );
  }
}

export async function hydrateGitStatus(
  bridge: SmokeBridge,
  cwd?: string,
  options?: { force?: boolean },
): Promise<void> {
  const trimmedCwd = cwd?.trim();
  if (!trimmedCwd || !bridge.isAvailable()) return;

  const gitState = useGitStore.getState();
  const existingStatus = gitState.statusByCwd[trimmedCwd];

  if (gitState.loadingByCwd[trimmedCwd]) {
    return;
  }

  if (!options?.force && existingStatus) {
    syncSessionGitMetadata(trimmedCwd, existingStatus);
    await hydrateGitDiffTotals(bridge, trimmedCwd, { status: existingStatus });
    return;
  }

  gitState.beginLoad(trimmedCwd);

  try {
    const result = await bridge.getGitStatus(trimmedCwd);
    useGitStore.getState().completeLoad(trimmedCwd, result);
    syncSessionGitMetadata(trimmedCwd, result);
    await hydrateGitDiffTotals(bridge, trimmedCwd, {
      force: options?.force,
      status: result,
    });
  } catch (error) {
    useGitStore
      .getState()
      .failLoad(trimmedCwd, error instanceof Error ? error.message : "Failed to load git status.");
    useGitStore.getState().clearDiffTotals(trimmedCwd);
  }
}
