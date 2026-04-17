import { Electroview } from "electrobun/view";
import type { OrchestratorRPC, SmokeProvider } from "../../shared/AppRPC.ts";
import type { SmokeBridge, SmokeBridgeEvent } from "./SmokeBridge.ts";

export class ElectrobunSmokeBridge implements SmokeBridge {
  private readonly listeners = new Set<(event: SmokeBridgeEvent) => void>();
  private readonly electroview: Electroview<any>;

  constructor() {
    const rpc = Electroview.defineRPC<OrchestratorRPC>({
      maxRequestTime: 300000,
      handlers: {
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
    sessionId?: string
  ) {
    return this.electroview.rpc.request.sendChatMessage({
      provider,
      message,
      model,
      sessionId
    });
  }

  async createChatSession(provider: SmokeProvider) {
    return this.electroview.rpc.request.createChatSession({
      provider
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
