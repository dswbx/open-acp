import type { ChatToolCallState } from "../../../shared/AppRPC.ts";
import type { RecordedToolCallGalleryItem } from "../../../shared/toolCallGallery.ts";
import { formatToolPresentation } from "../../chat/toolPresentation.ts";
import type { ChatToolCall } from "../../chat/types.ts";

export interface ToolCallGalleryFilters {
  provider: string;
  sessionId: string;
  kind: string;
  state: string;
  query: string;
}

export interface ToolCallGalleryFilterOptions {
  providers: string[];
  sessions: string[];
  kinds: string[];
  states: string[];
}

export const DEFAULT_TOOL_CALL_GALLERY_FILTERS: ToolCallGalleryFilters = {
  provider: "all",
  sessionId: "all",
  kind: "all",
  state: "all",
  query: "",
};

export function buildToolCallGalleryFilters(
  items: readonly RecordedToolCallGalleryItem[],
): ToolCallGalleryFilterOptions {
  return {
    providers: collectOptions(items.map((item) => item.provider)),
    sessions: collectOptions(items.map((item) => item.sessionId)),
    kinds: collectOptions(items.map((item) => item.toolKind)),
    states: collectOptions(items.map((item) => item.toolState)),
  };
}

export function filterToolCallGalleryItems(
  items: readonly RecordedToolCallGalleryItem[],
  filters: ToolCallGalleryFilters,
): RecordedToolCallGalleryItem[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.provider !== "all" && item.provider !== filters.provider) return false;
    if (filters.sessionId !== "all" && item.sessionId !== filters.sessionId) return false;
    if (filters.kind !== "all" && item.toolKind !== filters.kind) return false;
    if (filters.state !== "all" && item.toolState !== filters.state) return false;
    if (!query) return true;
    return searchableText(item).toLowerCase().includes(query);
  });
}

export function toChatToolCall(item: RecordedToolCallGalleryItem): ChatToolCall {
  const state = toChatToolCallState(item.toolState);
  const presentation = formatToolPresentation({
    toolCallId: item.toolCallId,
    toolTitle: item.toolTitle,
    toolKind: item.toolKind,
    state,
    input: item.input,
    output: item.output,
    errorText: item.errorText,
  });
  return {
    toolCallId: item.toolCallId,
    title: presentation.title,
    subtitle: presentation.subtitle,
    shimmerPrefix: presentation.shimmerPrefix,
    rawTitle: item.toolTitle,
    kind: item.toolKind,
    state,
    input: item.input,
    output: item.output,
    errorText: item.errorText,
    timestamp: item.timestamp,
  };
}

function collectOptions(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function toChatToolCallState(value: string | undefined): ChatToolCallState {
  if (
    value === "approval-requested" ||
    value === "approval-responded" ||
    value === "input-available" ||
    value === "input-streaming" ||
    value === "output-available" ||
    value === "output-denied" ||
    value === "output-error"
  ) {
    return value;
  }
  return "output-available";
}

function searchableText(item: RecordedToolCallGalleryItem): string {
  return [
    item.sessionId,
    item.requestId,
    item.provider,
    item.cwd,
    item.toolCallId,
    item.toolTitle,
    item.toolKind,
    item.toolState,
    item.errorText,
    item.sourcePath,
  ]
    .filter(Boolean)
    .join(" ");
}
