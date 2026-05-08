export interface ToolCallGalleryWarning {
  sessionId?: string;
  sourcePath?: string;
  lineNumber?: number;
  message: string;
}

export interface RecordedActivitySourceEvent {
  type: string;
  lineNumber: number;
  timestamp?: string;
  payload: unknown;
}

export interface ToolCallGallerySession {
  sessionId: string;
  workspaceId?: string;
  provider?: string;
  cwd?: string;
  eventCount: number;
  toolCallCount: number;
  thinkingCount: number;
  cancellationCount: number;
}

export interface RecordedToolCallGalleryItem {
  sessionId: string;
  workspaceId?: string;
  requestId?: string;
  provider?: string;
  cwd?: string;
  toolCallId: string;
  toolTitle?: string;
  toolKind?: string;
  toolState?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  firstTimestamp?: string;
  timestamp: string;
  eventCount: number;
  sourcePath: string;
  sourceEvents: RecordedActivitySourceEvent[];
}

export interface RecordedThinkingGalleryItem {
  sessionId: string;
  workspaceId?: string;
  requestId?: string;
  provider?: string;
  cwd?: string;
  text: string;
  firstTimestamp?: string;
  timestamp: string;
  eventCount: number;
  sourcePath: string;
  sourceEvents: RecordedActivitySourceEvent[];
}

export interface RecordedCancellationGalleryItem {
  sessionId: string;
  workspaceId?: string;
  requestId?: string;
  provider?: string;
  cwd?: string;
  reason?: string;
  method?: string;
  direction?: string;
  timestamp: string;
  sourcePath: string;
  sourceEvents: RecordedActivitySourceEvent[];
}

export interface ToolCallGalleryResponse {
  generatedAt: string;
  sessions: ToolCallGallerySession[];
  toolCalls: RecordedToolCallGalleryItem[];
  thinking: RecordedThinkingGalleryItem[];
  cancellations: RecordedCancellationGalleryItem[];
  warnings: ToolCallGalleryWarning[];
}
