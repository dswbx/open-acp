import type { ChatToolCallState } from "../../../shared/AppRPC.ts";
import type {
  RecordedCancellationGalleryItem,
  RecordedThinkingGalleryItem,
  RecordedToolCallGalleryItem,
} from "../../../shared/toolCallGallery.ts";
import { formatToolPresentation } from "../../chat/toolPresentation.ts";
import type { ChatToolCall } from "../../chat/types.ts";

export interface ToolCallGalleryFilters {
  provider: string;
  sessionId: string;
  kind: string;
  state: string;
  query: string;
}

export type ToolCallDisplayState = "in-progress" | "complete" | "error" | "cancelled";

export type ToolCallGroupBy = "none" | "kind";
export type OtherActivityKind = "thinking" | "cancellation";

export type RecordedOtherGalleryItem =
  | (RecordedThinkingGalleryItem & { activityKind: "thinking" })
  | (RecordedCancellationGalleryItem & { activityKind: "cancellation" });

export interface OtherActivityFilters {
  kind: string;
  provider: string;
  sessionId: string;
  query: string;
}

export interface OtherActivityFilterOptions {
  providers: string[];
  sessions: string[];
  kinds: OtherActivityKind[];
}

export interface ToolCallGalleryGroup {
  key: string;
  label: string;
  items: RecordedToolCallGalleryItem[];
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

export const DEFAULT_OTHER_ACTIVITY_FILTERS: OtherActivityFilters = {
  kind: "all",
  provider: "all",
  sessionId: "all",
  query: "",
};

export function buildToolCallGalleryFilters(
  items: readonly RecordedToolCallGalleryItem[],
): ToolCallGalleryFilterOptions {
  return {
    providers: collectOptions(items.map((item) => item.provider)),
    sessions: collectOptions(items.map((item) => item.sessionId)),
    kinds: collectOptions(items.map((item) => item.toolKind)),
    states: collectOptions(items.map(getToolCallDisplayState)),
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
    if (filters.state !== "all" && getToolCallDisplayState(item) !== filters.state) return false;
    if (!query) return true;
    return searchableText(item).toLowerCase().includes(query);
  });
}

export function buildOtherActivityItems(params: {
  thinking: readonly RecordedThinkingGalleryItem[];
  cancellations: readonly RecordedCancellationGalleryItem[];
}): RecordedOtherGalleryItem[] {
  return [
    ...params.thinking.map((item) => ({ ...item, activityKind: "thinking" as const })),
    ...params.cancellations.map((item) => ({ ...item, activityKind: "cancellation" as const })),
  ].sort(
    (left, right) =>
      right.timestamp.localeCompare(left.timestamp) ||
      left.sessionId.localeCompare(right.sessionId),
  );
}

export function buildOtherActivityFilters(
  items: readonly RecordedOtherGalleryItem[],
): OtherActivityFilterOptions {
  return {
    providers: collectOptions(items.map((item) => item.provider)),
    sessions: collectOptions(items.map((item) => item.sessionId)),
    kinds: ["thinking", "cancellation"],
  };
}

export function filterOtherActivityItems(
  items: readonly RecordedOtherGalleryItem[],
  filters: OtherActivityFilters,
): RecordedOtherGalleryItem[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.kind !== "all" && item.activityKind !== filters.kind) return false;
    if (filters.provider !== "all" && item.provider !== filters.provider) return false;
    if (filters.sessionId !== "all" && item.sessionId !== filters.sessionId) return false;
    if (!query) return true;
    return searchableOtherText(item).toLowerCase().includes(query);
  });
}

export function groupToolCallGalleryItems(
  items: readonly RecordedToolCallGalleryItem[],
  groupBy: ToolCallGroupBy,
): ToolCallGalleryGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "All tool calls", items: [...items] }];
  }

  const groups = new Map<string, RecordedToolCallGalleryItem[]>();
  for (const item of items) {
    const key = item.toolKind ?? "unknown kind";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupItems]) => ({
      key,
      label: key,
      items: groupItems,
    }));
}

export function getToolCallDisplayState(item: RecordedToolCallGalleryItem): ToolCallDisplayState {
  if (isCancellationLike(item.output) || includesCancelled(item.errorText)) return "cancelled";
  if (item.toolState === "output-error" || item.toolState === "output-denied" || item.errorText) {
    return "error";
  }
  if (
    item.toolState === "approval-requested" ||
    item.toolState === "input-available" ||
    item.toolState === "input-streaming"
  ) {
    return "in-progress";
  }
  return "complete";
}

export function toChatToolCall(
  item: RecordedToolCallGalleryItem,
  overrideState?: ChatToolCallState,
): ChatToolCall {
  const state = overrideState ?? toChatToolCallState(item.toolState);
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
    getToolCallDisplayState(item),
    item.errorText,
    item.sourcePath,
  ]
    .filter(Boolean)
    .join(" ");
}

function searchableOtherText(item: RecordedOtherGalleryItem): string {
  return [
    item.activityKind,
    item.sessionId,
    item.requestId,
    item.provider,
    item.cwd,
    "text" in item ? item.text : undefined,
    "reason" in item ? item.reason : undefined,
    "method" in item ? item.method : undefined,
    "direction" in item ? item.direction : undefined,
    item.sourcePath,
  ]
    .filter(Boolean)
    .join(" ");
}

function isCancellationLike(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.status === "cancelled" ||
    record.stopReason === "cancelled" ||
    includesCancelled(record.terminateReason)
  );
}

function includesCancelled(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().includes("cancel");
}
