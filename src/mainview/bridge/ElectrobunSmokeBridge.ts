import { Electroview } from "electrobun/view";
import type {
  ApprovalOutcome,
  OrchestratorRPC,
  SmokeProvider
} from "../../shared/AppRPC.ts";
import type { SmokeBridge, SmokeBridgeEvent } from "./SmokeBridge.ts";
import { getAppTestDriver } from "../testing/appTestDriver.ts";

export class ElectrobunSmokeBridge implements SmokeBridge {
  private readonly listeners = new Set<(event: SmokeBridgeEvent) => void>();
  private readonly electroview: Electroview<any>;

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
              payload
            });
          },
          smokeFinished: (payload) => {
            this.emit({
              type: "smokeFinished",
              payload
            });
          },
          chatStreamEvent: (payload) => {
            this.emit({
              type: "chatStreamEvent",
              payload
            });
          },
          approvalEvent: (payload) => {
            this.emit({
              type: "approvalEvent",
              payload
            });
          },
          agentTranscriptEvent: (payload) => {
            this.emit({
              type: "agentTranscriptEvent",
              payload
            });
          }
        }
      }
    });

    this.electroview = new Electroview({ rpc });
  }

  isAvailable(): boolean {
    const scopedWindow = window as Window & { __electrobun?: unknown };
    return Boolean(scopedWindow.__electrobun);
  }

  async startSmokeTest(provider: SmokeProvider, prompt: string) {
    return this.electroview.rpc.request.startSmokeTest({
      provider,
      prompt
    });
  }

  async sendChatMessage(
    provider: SmokeProvider,
    message: string,
    model?: string,
    sessionId?: string,
    cwd?: string
  ) {
    return this.electroview.rpc.request.sendChatMessage({
      provider,
      message,
      model,
      sessionId,
      cwd
    });
  }

  async createChatSession(provider: SmokeProvider, cwd?: string) {
    return this.electroview.rpc.request.createChatSession({
      provider,
      cwd
    });
  }

  async getHomeDirectory() {
    return this.electroview.rpc.request.getHomeDirectory({});
  }

  async chooseWorkingDirectory(startingFolder?: string) {
    return this.electroview.rpc.request.chooseWorkingDirectory({
      startingFolder
    });
  }

  async listDirectory(cwd: string) {
    return this.electroview.rpc.request.listDirectory({
      cwd
    });
  }

  async getGitStatus(cwd: string) {
    return this.electroview.rpc.request.getGitStatus({
      cwd
    });
  }

  async getGitDiff(cwd: string) {
    return this.electroview.rpc.request.getGitDiff({
      cwd
    });
  }

  async getGitFileDiff(cwd: string, path: string, originalPath?: string) {
    return this.electroview.rpc.request.getGitFileDiff({
      cwd,
      path,
      originalPath
    });
  }

  async cancelChatMessage(
    provider: SmokeProvider,
    sessionId?: string,
    requestId?: string,
    cwd?: string
  ) {
    return this.electroview.rpc.request.cancelChatMessage({
      provider,
      sessionId,
      requestId,
      cwd
    });
  }

  async getProviderModelCatalog(provider: SmokeProvider, cwd?: string) {
    return this.electroview.rpc.request.getProviderModelCatalog({
      provider,
      cwd
    });
  }

  async respondToApproval(
    provider: SmokeProvider,
    approvalId: string,
    outcome: ApprovalOutcome,
    cwd?: string
  ) {
    return this.electroview.rpc.request.respondToApproval({
      provider,
      approvalId,
      outcome,
      cwd
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
