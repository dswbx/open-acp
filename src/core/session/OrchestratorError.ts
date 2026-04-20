export type OrchestratorErrorCode =
  | "UNKNOWN_AGENT"
  | "UNKNOWN_SESSION"
  | "AGENT_INITIALIZE_FAILED"
  | "SESSION_CREATE_FAILED"
  | "SESSION_LIST_FAILED"
  | "SESSION_PROMPT_FAILED"
  | "SESSION_CANCEL_FAILED";

export interface OrchestratorErrorDetails {
  agentId?: string;
  sessionId?: string;
  promptId?: string;
  cause?: unknown;
}

export class OrchestratorError extends Error {
  readonly code: OrchestratorErrorCode;
  readonly details: OrchestratorErrorDetails;

  constructor(
    code: OrchestratorErrorCode,
    message: string,
    details: OrchestratorErrorDetails = {},
  ) {
    super(message);
    this.name = "OrchestratorError";
    this.code = code;
    this.details = details;
    if (details.cause instanceof Error) {
      (this as { cause?: unknown }).cause = details.cause;
    }
  }
}

export function wrapOrchestratorError(
  code: OrchestratorErrorCode,
  message: string,
  details: OrchestratorErrorDetails,
  error: unknown,
): OrchestratorError {
  if (error instanceof OrchestratorError) {
    return error;
  }
  const causeMessage = error instanceof Error ? error.message : String(error);
  return new OrchestratorError(code, `${message}: ${causeMessage}`, {
    ...details,
    cause: error,
  });
}
