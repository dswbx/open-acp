import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse
} from "./ACPTypes.ts";

export type ACPMessageHandler = (message: ACPInboundMessage) => void;

export abstract class ACPTransport {
  private messageHandler?: ACPMessageHandler;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendRequest(request: ACPJsonRpcRequest): Promise<void>;
  abstract sendNotification(
    notification: ACPJsonRpcNotification
  ): Promise<void>;
  abstract sendResponse(response: ACPJsonRpcResponse): Promise<void>;

  setMessageHandler(handler: ACPMessageHandler): void {
    this.messageHandler = handler;
  }

  protected dispatchIncomingMessage(message: ACPInboundMessage): void {
    if (!this.messageHandler) {
      return;
    }
    this.messageHandler(message);
  }
}
