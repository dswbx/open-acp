import type {
  ACPInboundMessage,
  ACPJsonRpcNotification,
  ACPJsonRpcRequest,
  ACPJsonRpcResponse,
  ACPRequestId,
  ACPSessionRequestPermissionParams,
  ACPSessionUpdate,
} from "../core/acp/ACPTypes.ts";
import type { ChatToolCallState } from "../shared/AppRPC.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getRequestMapKey(requestId: ACPRequestId): string {
  return String(requestId);
}

export function isJsonRpcResponse(
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
): message is ACPJsonRpcResponse {
  return !("method" in message);
}

export function isJsonRpcRequestLike(
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
): message is ACPJsonRpcRequest {
  return "method" in message && "id" in message;
}

export function isJsonRpcNotificationLike(
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
): message is ACPJsonRpcNotification {
  return "method" in message && !("id" in message);
}

export function inferSessionIdFromMessage(
  message: ACPInboundMessage | ACPJsonRpcNotification | ACPJsonRpcRequest | ACPJsonRpcResponse,
  fallbackSessionId?: string,
): string | undefined {
  if (
    "params" in message &&
    isRecord(message.params) &&
    typeof message.params.sessionId === "string"
  ) {
    return message.params.sessionId;
  }
  if (
    "result" in message &&
    isRecord(message.result) &&
    typeof message.result.sessionId === "string"
  ) {
    return message.result.sessionId;
  }
  return fallbackSessionId;
}

export function stringifyRawInput(
  toolCall: ACPSessionRequestPermissionParams["toolCall"],
): string | undefined {
  if (typeof toolCall.rawInput === "string") {
    return toolCall.rawInput;
  }
  if (toolCall.rawInput === null || toolCall.rawInput === undefined) {
    return undefined;
  }
  return JSON.stringify(toolCall.rawInput, null, 2);
}

export function extractChunkText(update: ACPSessionUpdate): string | undefined {
  const content = (update as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  if (isRecord(content) && typeof content.text === "string") {
    return content.text;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }

  return content
    .map((item) => {
      if (!isRecord(item) || typeof item.text !== "string") {
        return "";
      }
      return item.text;
    })
    .join("");
}

export function summarizeSessionUpdate(update: ACPSessionUpdate): string | undefined {
  switch (update.sessionUpdate) {
    case "available_commands_update":
    case "usage_update":
    case "tool_call":
    case "tool_call_update":
    case "agent_message_chunk":
    case "agent_thought_chunk":
    case "config_option_update":
      return undefined;
    default:
      return update.sessionUpdate.replaceAll("_", " ");
  }
}

export function extractToolState(status: string | null | undefined): ChatToolCallState {
  switch (status) {
    case "pending":
      return "input-streaming";
    case "in_progress":
    case "running":
      return "input-available";
    case "completed":
    case "success":
      return "output-available";
    case "denied":
    case "rejected":
    case "cancelled":
      return "output-denied";
    case "failed":
    case "error":
      return "output-error";
    default:
      return "input-available";
  }
}

export function extractToolErrorText(rawOutput: unknown): string | undefined {
  if (typeof rawOutput === "string") {
    return rawOutput;
  }
  if (!isRecord(rawOutput)) {
    return undefined;
  }
  const directError = rawOutput.error;
  if (typeof directError === "string" && directError.trim().length > 0) {
    return directError;
  }
  const stderr = rawOutput.stderr;
  if (typeof stderr === "string" && stderr.trim().length > 0) {
    return stderr;
  }
  return undefined;
}

export function extractUsage(update: ACPSessionUpdate): { used: number; size: number } | undefined {
  const used = (update as { used?: unknown }).used;
  const size = (update as { size?: unknown }).size;
  if (typeof used !== "number" || typeof size !== "number") {
    return undefined;
  }
  return { used, size };
}

export function normalizeLogMessage(line: string): string | undefined {
  const cleaned = line.replace(/\r?\n/g, "").trim();
  if (cleaned.length === 0) {
    return undefined;
  }
  return cleaned;
}
