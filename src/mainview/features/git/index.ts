export { GitBranchSwitcher } from "./components/GitBranchSwitcher.tsx";
export { GitHeaderSummary } from "./components/GitHeaderSummary.tsx";
export { GitPanel } from "./components/GitPanel.tsx";
export {
  hydrateGitDiffTotals,
  hydrateGitStatus,
  reconcileGitTabForActiveSession,
} from "./gitActions.ts";
export {
  calculateGitDiffLineTotals,
  calculateGitDiffLineTotalsFromTexts,
  formatGitChangeBreakdown,
  formatGitSessionSummary,
  getGitBranchLabel,
} from "./gitPresentation.ts";
export type { GitDiffTotals } from "./gitPresentation.ts";
export { useGitStore } from "./state/gitStore.ts";
