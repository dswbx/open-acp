export interface ToolCallGalleryWarning {
  sessionId?: string;
  sourcePath?: string;
  lineNumber?: number;
  message: string;
}

export interface ToolCallGallerySession {
  sessionId: string;
  provider?: string;
  cwd?: string;
  eventCount: number;
  toolCallCount: number;
}

export interface RecordedToolCallGalleryItem {
  sessionId: string;
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
}

export interface ToolCallGalleryResponse {
  generatedAt: string;
  sessions: ToolCallGallerySession[];
  toolCalls: RecordedToolCallGalleryItem[];
  warnings: ToolCallGalleryWarning[];
}
