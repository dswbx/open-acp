import { Electroview } from "electrobun/view";
import type {
  ApprovalOutcome,
  OrchestratorRPC,
  SmokeProvider,
  UserInputOutcome,
} from "../../shared/AppRPC.ts";
import type { SmokeBridge, SmokeBridgeEvent } from "./SmokeBridge.ts";
import { getAppTestDriver } from "../testing/appTestDriver.ts";

type BridgeRequestApi = {
  startSmokeTest: ElectroviewRequestApi["startSmokeTest"];
  sendChatMessage: ElectroviewRequestApi["sendChatMessage"];
  createChatSession: ElectroviewRequestApi["createChatSession"];
  getHomeDirectory: ElectroviewRequestApi["getHomeDirectory"];
  getUILayoutState: ElectroviewRequestApi["getUILayoutState"];
  setUILayoutState: ElectroviewRequestApi["setUILayoutState"];
  chooseWorkingDirectory: ElectroviewRequestApi["chooseWorkingDirectory"];
  listDirectory: ElectroviewRequestApi["listDirectory"];
  getGitStatus: ElectroviewRequestApi["getGitStatus"];
  getGitBranches: ElectroviewRequestApi["getGitBranches"];
  getGitDiff: ElectroviewRequestApi["getGitDiff"];
  getGitFileDiff: ElectroviewRequestApi["getGitFileDiff"];
  switchGitBranch: ElectroviewRequestApi["switchGitBranch"];
  cancelChatMessage: ElectroviewRequestApi["cancelChatMessage"];
  getProviderModelCatalog: ElectroviewRequestApi["getProviderModelCatalog"];
  getAvailableCommands: ElectroviewRequestApi["getAvailableCommands"];
  respondToApproval: ElectroviewRequestApi["respondToApproval"];
  respondToUserInput: ElectroviewRequestApi["respondToUserInput"];
};

type ElectroviewRequestApi = {
  startSmokeTest: (
    params: OrchestratorRPC["bun"]["requests"]["startSmokeTest"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["startSmokeTest"]["response"]>;
  sendChatMessage: (
    params: OrchestratorRPC["bun"]["requests"]["sendChatMessage"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["sendChatMessage"]["response"]>;
  createChatSession: (
    params: OrchestratorRPC["bun"]["requests"]["createChatSession"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["createChatSession"]["response"]>;
  getHomeDirectory: (
    params: OrchestratorRPC["bun"]["requests"]["getHomeDirectory"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["getHomeDirectory"]["response"]>;
  getUILayoutState: (
    params: OrchestratorRPC["bun"]["requests"]["getUILayoutState"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["getUILayoutState"]["response"]>;
  setUILayoutState: (
    params: OrchestratorRPC["bun"]["requests"]["setUILayoutState"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["setUILayoutState"]["response"]>;
  chooseWorkingDirectory: (
    params: OrchestratorRPC["bun"]["requests"]["chooseWorkingDirectory"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["chooseWorkingDirectory"]["response"]>;
  listDirectory: (
    params: OrchestratorRPC["bun"]["requests"]["listDirectory"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["listDirectory"]["response"]>;
  getGitStatus: (
    params: OrchestratorRPC["bun"]["requests"]["getGitStatus"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["getGitStatus"]["response"]>;
  getGitBranches: (
    params: OrchestratorRPC["bun"]["requests"]["getGitBranches"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["getGitBranches"]["response"]>;
  getGitDiff: (
    params: OrchestratorRPC["bun"]["requests"]["getGitDiff"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["getGitDiff"]["response"]>;
  getGitFileDiff: (
    params: OrchestratorRPC["bun"]["requests"]["getGitFileDiff"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["getGitFileDiff"]["response"]>;
  switchGitBranch: (
    params: OrchestratorRPC["bun"]["requests"]["switchGitBranch"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["switchGitBranch"]["response"]>;
  cancelChatMessage: (
    params: OrchestratorRPC["bun"]["requests"]["cancelChatMessage"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["cancelChatMessage"]["response"]>;
  getProviderModelCatalog: (
    params: OrchestratorRPC["bun"]["requests"]["getProviderModelCatalog"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["getProviderModelCatalog"]["response"]>;
  getAvailableCommands: (
    params: OrchestratorRPC["bun"]["requests"]["getAvailableCommands"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["getAvailableCommands"]["response"]>;
  respondToApproval: (
    params: OrchestratorRPC["bun"]["requests"]["respondToApproval"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["respondToApproval"]["response"]>;
  respondToUserInput: (
    params: OrchestratorRPC["bun"]["requests"]["respondToUserInput"]["params"],
  ) => Promise<OrchestratorRPC["bun"]["requests"]["respondToUserInput"]["response"]>;
};

type ElectroviewType = {
  rpc?: {
    request?: BridgeRequestApi;
  };
};

export class ElectrobunSmokeBridge implements SmokeBridge {
  private readonly listeners = new Set<(event: SmokeBridgeEvent) => void>();
  private readonly electroview: ElectroviewType;

  constructor() {
    const rpc = Electroview.defineRPC<OrchestratorRPC>({
      maxRequestTime: 300000,
      handlers: {
        requests: {
          getTestSnapshot: async () => getAppTestDriver().getSnapshot(),
          waitForTestState: async (params) => getAppTestDriver().waitForState(params),
          performTestAction: async (params) => getAppTestDriver().performAction(params),
        },
        messages: {
          smokeEvent: (payload) => {
            this.emit({
              type: "smokeEvent",
              payload,
            });
          },
          smokeFinished: (payload) => {
            this.emit({
              type: "smokeFinished",
              payload,
            });
          },
          chatStreamEvent: (payload) => {
            this.emit({
              type: "chatStreamEvent",
              payload,
            });
          },
          approvalEvent: (payload) => {
            this.emit({
              type: "approvalEvent",
              payload,
            });
          },
          userInputEvent: (payload) => {
            this.emit({
              type: "userInputEvent",
              payload,
            });
          },
          agentTranscriptEvent: (payload) => {
            this.emit({
              type: "agentTranscriptEvent",
              payload,
            });
          },
          availableCommandsEvent: (payload) => {
            this.emit({
              type: "availableCommandsEvent",
              payload,
            });
          },
        },
      },
    });

    this.electroview = new Electroview({ rpc });
  }

  private get requestApi(): BridgeRequestApi {
    const rpcWithRequests = this.electroview.rpc as
      | {
          request?: BridgeRequestApi;
        }
      | undefined;
    if (!rpcWithRequests?.request) {
      throw new Error("Electrobun RPC request API is not available.");
    }
    return rpcWithRequests.request;
  }

  isAvailable(): boolean {
    const scopedWindow = window as Window & { __electrobun?: unknown };
    return Boolean(scopedWindow.__electrobun);
  }

  async startSmokeTest(provider: SmokeProvider, prompt: string) {
    return this.requestApi.startSmokeTest({
      provider,
      prompt,
    });
  }

  async sendChatMessage(
    provider: SmokeProvider,
    message: string,
    model?: string,
    sessionId?: string,
    cwd?: string,
  ) {
    return this.requestApi.sendChatMessage({
      provider,
      message,
      model,
      sessionId,
      cwd,
    });
  }

  async createChatSession(provider: SmokeProvider, cwd?: string) {
    return this.requestApi.createChatSession({
      provider,
      cwd,
    });
  }

  async getHomeDirectory() {
    return this.requestApi.getHomeDirectory({});
  }

  async getUILayoutState() {
    return this.requestApi.getUILayoutState({});
  }

  async setUILayoutState(
    state: OrchestratorRPC["bun"]["requests"]["setUILayoutState"]["params"]["state"],
  ) {
    return this.requestApi.setUILayoutState({
      state,
    });
  }

  async chooseWorkingDirectory(startingFolder?: string) {
    return this.requestApi.chooseWorkingDirectory({
      startingFolder,
    });
  }

  async listDirectory(cwd: string) {
    return this.requestApi.listDirectory({
      cwd,
    });
  }

  async getGitStatus(cwd: string) {
    return this.requestApi.getGitStatus({
      cwd,
    });
  }

  async getGitBranches(cwd: string) {
    return this.requestApi.getGitBranches({
      cwd,
    });
  }

  async getGitDiff(cwd: string) {
    return this.requestApi.getGitDiff({
      cwd,
    });
  }

  async getGitFileDiff(cwd: string, path: string, originalPath?: string) {
    return this.requestApi.getGitFileDiff({
      cwd,
      path,
      originalPath,
    });
  }

  async switchGitBranch(cwd: string, branch: string) {
    return this.requestApi.switchGitBranch({
      cwd,
      branch,
    });
  }

  async cancelChatMessage(
    provider: SmokeProvider,
    sessionId?: string,
    requestId?: string,
    cwd?: string,
  ) {
    return this.requestApi.cancelChatMessage({
      provider,
      sessionId,
      requestId,
      cwd,
    });
  }

  async getProviderModelCatalog(provider: SmokeProvider, cwd?: string) {
    return this.requestApi.getProviderModelCatalog({
      provider,
      cwd,
    });
  }

  async getAvailableCommands(provider: SmokeProvider, sessionId?: string, cwd?: string) {
    return this.requestApi.getAvailableCommands({
      provider,
      sessionId,
      cwd,
    });
  }

  async respondToApproval(
    provider: SmokeProvider,
    approvalId: string,
    outcome: ApprovalOutcome,
    cwd?: string,
  ) {
    return this.requestApi.respondToApproval({
      provider,
      approvalId,
      outcome,
      cwd,
    });
  }

  async respondToUserInput(
    provider: SmokeProvider,
    inputId: string,
    outcome: UserInputOutcome,
    cwd?: string,
  ) {
    return this.requestApi.respondToUserInput({
      provider,
      inputId,
      outcome,
      cwd,
    });
  }

  subscribe(listener: (event: SmokeBridgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: SmokeBridgeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
