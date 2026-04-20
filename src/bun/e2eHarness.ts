import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ApprovalOutcome,
  CancelChatMessageResult,
  ChatStreamEventPayload,
  CreateChatSessionResult,
  GetGitBranchesResult,
  GetGitDiffResult,
  GetGitFileDiffResult,
  GetGitStatusResult,
  GetProviderModelCatalogResult,
  ListDirectoryResult,
  RespondToApprovalResult,
  SmokeProvider,
  SwitchGitBranchResult,
} from "../shared/AppRPC.ts";
import { createEmptyProviderModelCatalog } from "../shared/providerModels.ts";
import type {
  ReplayFixtureAction,
  ReplayFixtureEventRecord,
  ReplayFixtureMetadata,
  ReplayFixturePhase,
  ReplayFixtureSendMessageAction,
} from "../shared/e2e.ts";
import {
  createEmptyGitBranches,
  createEmptyGitDiff,
  createEmptyGitFileDiff,
  createEmptyGitStatus,
} from "./e2eGitEmptyResults.ts";
import type { SessionTranscriptStore } from "./SessionTranscriptStore.ts";

export { startE2EControlServer } from "./e2eControlServer.ts";

interface ReplayHarnessDependencies {
  fixturesRoot: string;
  transcriptStore: SessionTranscriptStore;
  transcriptRootCwd: string;
  emitChatStreamEvent: (payload: ChatStreamEventPayload) => void;
  emitApprovalEvent: (
    payload: Extract<ReplayFixtureEventRecord, { type: "approvalEvent" }>["payload"],
  ) => void;
  emitAgentTranscriptEvent: (
    payload: Extract<ReplayFixtureEventRecord, { type: "agentTranscriptEvent" }>["payload"],
  ) => void;
}

interface LoadedReplayFixture {
  metadata: ReplayFixtureMetadata;
  events: ReplayFixtureEventRecord[];
}

interface PendingApprovalResume {
  action: ReplayFixtureSendMessageAction;
  nextPhaseIndex: number;
  expectedOptionId?: string;
  requestId: string;
  sessionId: string;
  provider: SmokeProvider;
  cwd: string;
}

interface PendingCancelResume {
  action: ReplayFixtureSendMessageAction;
  nextPhaseIndex: number;
  requestId: string;
  sessionId: string;
  provider: SmokeProvider;
  cwd: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseFixture(fixtureDirectory: string): Promise<LoadedReplayFixture> {
  const [metadataText, eventsText] = await Promise.all([
    readFile(path.join(fixtureDirectory, "metadata.json"), "utf8"),
    readFile(path.join(fixtureDirectory, "events.jsonl"), "utf8"),
  ]);

  const metadata = JSON.parse(metadataText) as ReplayFixtureMetadata;
  const events = eventsText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ReplayFixtureEventRecord);

  return {
    metadata,
    events,
  };
}

export class ReplayFixtureHarness {
  private readonly fixturesRoot: string;
  private readonly transcriptStore: SessionTranscriptStore;
  private readonly transcriptRootCwd: string;
  private readonly emitChatStreamEvent: ReplayHarnessDependencies["emitChatStreamEvent"];
  private readonly emitApprovalEvent: ReplayHarnessDependencies["emitApprovalEvent"];
  private readonly emitAgentTranscriptEvent: ReplayHarnessDependencies["emitAgentTranscriptEvent"];
  private loadedFixture?: LoadedReplayFixture;
  private currentRunVersion = 0;
  private usedActionIds = new Set<string>();
  private readonly pendingApprovalResumes = new Map<string, PendingApprovalResume>();
  private pendingCancelResume?: PendingCancelResume;

  constructor(dependencies: ReplayHarnessDependencies) {
    this.fixturesRoot = dependencies.fixturesRoot;
    this.transcriptStore = dependencies.transcriptStore;
    this.transcriptRootCwd = dependencies.transcriptRootCwd;
    this.emitChatStreamEvent = dependencies.emitChatStreamEvent;
    this.emitApprovalEvent = dependencies.emitApprovalEvent;
    this.emitAgentTranscriptEvent = dependencies.emitAgentTranscriptEvent;
  }

  get isEnabled(): boolean {
    return true;
  }

  get currentFixtureName(): string | undefined {
    return this.loadedFixture?.metadata.fixtureName;
  }

  async loadFixture(fixtureName: string): Promise<ReplayFixtureMetadata> {
    const fixtureDirectory = path.join(this.fixturesRoot, fixtureName);
    const loadedFixture = await parseFixture(fixtureDirectory);
    this.loadedFixture = loadedFixture;
    this.resetRuntimeState();
    return loadedFixture.metadata;
  }

  resetRuntimeState(): void {
    this.currentRunVersion += 1;
    this.usedActionIds.clear();
    this.pendingApprovalResumes.clear();
    this.pendingCancelResume = undefined;
  }

  private requireFixture(): LoadedReplayFixture {
    if (!this.loadedFixture) {
      throw new Error("No replay fixture is loaded.");
    }
    return this.loadedFixture;
  }

  getHomeDirectory(): string {
    return this.requireFixture().metadata.homeDirectory;
  }

  listDirectory(cwd: string): ListDirectoryResult {
    const fixture = this.requireFixture();
    return {
      cwd,
      entries: fixture.metadata.directoryEntriesByCwd?.[cwd] ?? [],
    };
  }

  getGitStatus(cwd: string): GetGitStatusResult {
    const fixture = this.requireFixture();
    return fixture.metadata.gitStatusesByCwd?.[cwd] ?? createEmptyGitStatus(cwd);
  }

  getGitBranches(cwd: string): GetGitBranchesResult {
    const gitStatus = this.getGitStatus(cwd);
    if (!gitStatus.isGitRepository) {
      return createEmptyGitBranches(cwd);
    }

    return {
      cwd,
      isGitRepository: true,
      repositoryRoot: gitStatus.repositoryRoot,
      currentBranch: gitStatus.branch,
      detached: gitStatus.detached,
      branches: gitStatus.branch
        ? [
            {
              name: gitStatus.branch,
              isCurrent: true,
            },
          ]
        : [],
    };
  }

  getGitDiff(cwd: string): GetGitDiffResult {
    const fixture = this.requireFixture();
    return fixture.metadata.gitDiffsByCwd?.[cwd] ?? createEmptyGitDiff(cwd);
  }

  getGitFileDiff(cwd: string, path: string, originalPath?: string): GetGitFileDiffResult {
    const fixture = this.requireFixture();
    const repository = fixture.metadata.gitDiffsByCwd?.[cwd];
    const match = repository?.files.find(
      (file) => file.path === path && file.originalPath === originalPath,
    );
    return match
      ? {
          cwd,
          path,
          originalPath,
          text: match.text,
        }
      : createEmptyGitFileDiff(cwd, path, originalPath);
  }

  getProviderModelCatalog(provider: SmokeProvider): GetProviderModelCatalogResult {
    const fixture = this.requireFixture();
    return {
      provider,
      catalog:
        fixture.metadata.providerModelCatalogs[provider] ??
        createEmptyProviderModelCatalog(provider),
    };
  }

  async switchGitBranch(cwd: string, branch: string): Promise<SwitchGitBranchResult> {
    const gitBranches = this.getGitBranches(cwd);
    const branchExists = gitBranches.branches.some((entry) => entry.name === branch);
    if (!branchExists) {
      throw new Error(`Branch "${branch}" is not available in the replay fixture.`);
    }

    return {
      cwd,
      previousBranch: gitBranches.currentBranch,
      currentBranch: branch,
    };
  }

  async createChatSession(provider: SmokeProvider, cwd?: string): Promise<CreateChatSessionResult> {
    const fixture = this.requireFixture();
    const action = fixture.metadata.actions.find(
      (entry): entry is Extract<ReplayFixtureAction, { type: "createChatSession" }> =>
        entry.type === "createChatSession" &&
        !this.usedActionIds.has(entry.actionId) &&
        entry.provider === provider &&
        (cwd == null || entry.cwd === cwd),
    );
    if (!action) {
      throw new Error(
        `No replay createChatSession action matches provider=${provider} cwd=${cwd ?? "<default>"}.`,
      );
    }

    this.usedActionIds.add(action.actionId);
    const session =
      fixture.metadata.sessions.find((entry) => entry.sessionId === action.sessionId) ??
      fixture.metadata.sessions[0];
    if (!session) {
      throw new Error(`Fixture ${fixture.metadata.fixtureName} has no sessions.`);
    }

    await this.transcriptStore.writeMetadata({
      cwd: this.transcriptRootCwd,
      sessionId: session.sessionId,
      metadata: {
        schemaVersion: 1,
        fixtureName: fixture.metadata.fixtureName,
        provider: session.provider,
        cwd: session.cwd,
        sessionId: session.sessionId,
      },
    });

    return {
      provider: session.provider,
      sessionId: session.sessionId,
      cwd: session.cwd,
    };
  }

  async sendChatMessage(params: {
    provider: SmokeProvider;
    message: string;
    model?: string;
    sessionId?: string;
    cwd?: string;
  }): Promise<{
    requestId: string;
    provider: SmokeProvider;
    sessionId: string;
    cwd: string;
    model?: string;
  }> {
    const fixture = this.requireFixture();
    const action = fixture.metadata.actions.find(
      (entry): entry is ReplayFixtureSendMessageAction =>
        entry.type === "sendChatMessage" &&
        !this.usedActionIds.has(entry.actionId) &&
        entry.provider === params.provider &&
        entry.message === params.message &&
        (params.sessionId == null || entry.sessionId === params.sessionId) &&
        (params.cwd == null || entry.cwd === params.cwd) &&
        (params.model == null || entry.model === params.model),
    );
    if (!action) {
      throw new Error(
        `No replay sendChatMessage action matches provider=${params.provider} sessionId=${params.sessionId ?? "<none>"} message=${params.message}.`,
      );
    }

    this.usedActionIds.add(action.actionId);
    const runVersion = this.currentRunVersion;
    void this.playPhases(action, 0, runVersion);

    return action.result;
  }

  async cancelChatMessage(params: {
    provider: SmokeProvider;
    requestId?: string;
    sessionId?: string;
  }): Promise<CancelChatMessageResult> {
    const pendingResume = this.pendingCancelResume;
    if (
      !pendingResume ||
      pendingResume.provider !== params.provider ||
      (params.requestId != null && pendingResume.requestId !== params.requestId) ||
      (params.sessionId != null && pendingResume.sessionId !== params.sessionId)
    ) {
      throw new Error("No replay request is currently waiting for cancellation.");
    }

    this.pendingCancelResume = undefined;
    void this.playPhases(
      pendingResume.action,
      pendingResume.nextPhaseIndex,
      this.currentRunVersion,
    );

    return {
      provider: pendingResume.provider,
      requestId: pendingResume.requestId,
      sessionId: pendingResume.sessionId,
      cwd: pendingResume.cwd,
      cancelledAt: new Date().toISOString(),
    };
  }

  async respondToApproval(params: {
    provider: SmokeProvider;
    approvalId: string;
    outcome: ApprovalOutcome;
  }): Promise<RespondToApprovalResult> {
    const pendingResume = this.pendingApprovalResumes.get(params.approvalId);
    if (!pendingResume || pendingResume.provider !== params.provider) {
      throw new Error(`Unknown replay approval request: ${params.approvalId}`);
    }
    if (params.outcome.outcome !== "selected") {
      throw new Error("Replay approvals require an explicit selected option.");
    }
    if (
      pendingResume.expectedOptionId &&
      pendingResume.expectedOptionId !== params.outcome.optionId
    ) {
      throw new Error(
        `Replay approval ${params.approvalId} expected option ${pendingResume.expectedOptionId}, received ${params.outcome.optionId}.`,
      );
    }

    this.pendingApprovalResumes.delete(params.approvalId);
    void this.playPhases(
      pendingResume.action,
      pendingResume.nextPhaseIndex,
      this.currentRunVersion,
    );

    return {
      provider: pendingResume.provider,
      approvalId: params.approvalId,
      sessionId: pendingResume.sessionId,
      cwd: pendingResume.cwd,
      outcome: params.outcome,
      respondedAt: new Date().toISOString(),
    };
  }

  private async playPhases(
    action: ReplayFixtureSendMessageAction,
    startingPhaseIndex: number,
    runVersion: number,
  ): Promise<void> {
    const fixture = this.requireFixture();

    for (let phaseIndex = startingPhaseIndex; phaseIndex < action.phases.length; phaseIndex += 1) {
      if (runVersion !== this.currentRunVersion) {
        return;
      }

      const phase = action.phases[phaseIndex];
      if (phase.kind === "emit") {
        await this.emitPhaseEvents(action, phase, fixture.events, runVersion);
        continue;
      }

      if (phase.kind === "awaitApproval") {
        this.pendingApprovalResumes.set(phase.approvalId, {
          action,
          nextPhaseIndex: phaseIndex + 1,
          expectedOptionId: phase.expectedOptionId,
          requestId: action.result.requestId,
          sessionId: action.result.sessionId,
          provider: action.result.provider,
          cwd: action.result.cwd,
        });
        return;
      }

      this.pendingCancelResume = {
        action,
        nextPhaseIndex: phaseIndex + 1,
        requestId: action.result.requestId,
        sessionId: action.result.sessionId,
        provider: action.result.provider,
        cwd: action.result.cwd,
      };
      return;
    }
  }

  private async emitPhaseEvents(
    action: ReplayFixtureSendMessageAction,
    phase: Extract<ReplayFixturePhase, { kind: "emit" }>,
    events: ReplayFixtureEventRecord[],
    runVersion: number,
  ): Promise<void> {
    const selectedEvents = events.slice(phase.startEventIndex, phase.endEventIndex);
    for (const event of selectedEvents) {
      if (runVersion !== this.currentRunVersion) {
        return;
      }
      const delayMs = event.delayMs ?? 0;
      if (delayMs > 0) {
        await delay(delayMs);
      }
      if (runVersion !== this.currentRunVersion) {
        return;
      }
      await this.emitReplayEvent(action, event);
    }
  }

  private async emitReplayEvent(
    action: ReplayFixtureSendMessageAction,
    event: ReplayFixtureEventRecord,
  ): Promise<void> {
    if (event.type === "chatStreamEvent") {
      this.emitChatStreamEvent(event.payload);
    } else if (event.type === "approvalEvent") {
      this.emitApprovalEvent(event.payload);
    } else {
      this.emitAgentTranscriptEvent(event.payload);
    }
  }
}
