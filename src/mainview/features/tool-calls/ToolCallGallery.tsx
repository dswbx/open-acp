import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Braces, RefreshCw } from "lucide-react";
import type {
  RecordedCancellationGalleryItem,
  RecordedThinkingGalleryItem,
  RecordedToolCallGalleryItem,
  RecordedActivitySourceEvent,
  ToolCallGalleryResponse,
} from "../../../shared/toolCallGallery.ts";
import { CompactReasoning } from "../../components/CompactReasoning.tsx";
import { CompactToolCall } from "../../components/CompactToolCall.tsx";
import {
  DEFAULT_OTHER_ACTIVITY_FILTERS,
  DEFAULT_TOOL_CALL_GALLERY_FILTERS,
  buildOtherActivityFilters,
  buildOtherActivityItems,
  buildToolCallGalleryFilters,
  filterOtherActivityItems,
  filterToolCallGalleryItems,
  getToolCallDisplayState,
  groupToolCallGalleryItems,
  toChatToolCall,
  type OtherActivityFilters,
  type RecordedOtherGalleryItem,
  type ToolCallGalleryFilters,
  type ToolCallGroupBy,
} from "./toolCallGalleryModel.ts";

const TOOL_CALL_ENDPOINT = "/__open-acp/tool-calls";

export function ToolCallGalleryApp(): React.ReactElement {
  const [data, setData] = React.useState<ToolCallGalleryResponse | undefined>();
  const [error, setError] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await fetch(TOOL_CALL_ENDPOINT);
      if (!response.ok) {
        throw new Error(`Failed to load recorded tool calls: ${response.status}`);
      }
      setData((await response.json()) as ToolCallGalleryResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load recorded tool calls.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (isLoading && !data) {
    return <ToolCallGalleryShell>Loading recorded tool calls...</ToolCallGalleryShell>;
  }

  if (error && !data) {
    return (
      <ToolCallGalleryShell>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="size-4" />
          <span>{error}</span>
        </div>
        <Button className="mt-4" onClick={() => void load()} type="button" variant="outline">
          <RefreshCw className="size-4" />
          Reload
        </Button>
      </ToolCallGalleryShell>
    );
  }

  return (
    <ToolCallGalleryView data={data ?? emptyResponse()} isRefreshing={isLoading} onRefresh={load} />
  );
}

export function ToolCallGalleryView({
  data,
  isRefreshing = false,
  onRefresh,
}: {
  data: ToolCallGalleryResponse;
  isRefreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
}): React.ReactElement {
  const [filters, setFilters] = React.useState<ToolCallGalleryFilters>(
    DEFAULT_TOOL_CALL_GALLERY_FILTERS,
  );
  const [otherFilters, setOtherFilters] = React.useState<OtherActivityFilters>(
    DEFAULT_OTHER_ACTIVITY_FILTERS,
  );
  const [groupBy, setGroupBy] = React.useState<ToolCallGroupBy>("none");
  const [activeTab, setActiveTab] = React.useState("tool-calls");
  const [forcedInProgressIds, setForcedInProgressIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const filterOptions = React.useMemo(
    () => buildToolCallGalleryFilters(data.toolCalls),
    [data.toolCalls],
  );
  const otherItems = React.useMemo(
    () => buildOtherActivityItems({ thinking: data.thinking, cancellations: data.cancellations }),
    [data.cancellations, data.thinking],
  );
  const otherFilterOptions = React.useMemo(
    () => buildOtherActivityFilters(otherItems),
    [otherItems],
  );
  const visibleItems = React.useMemo(
    () => filterToolCallGalleryItems(data.toolCalls, filters),
    [data.toolCalls, filters],
  );
  const visibleOtherItems = React.useMemo(
    () => filterOtherActivityItems(otherItems, otherFilters),
    [otherFilters, otherItems],
  );
  const groupedItems = React.useMemo(
    () => groupToolCallGalleryItems(visibleItems, groupBy),
    [groupBy, visibleItems],
  );
  const toggleForcedInProgress = React.useCallback((itemKey: string, enabled: boolean) => {
    setForcedInProgressIds((current) => {
      const next = new Set(current);
      if (enabled) {
        next.add(itemKey);
      } else {
        next.delete(itemKey);
      }
      return next;
    });
  }, []);

  return (
    <ToolCallGalleryShell>
      <Tabs
        className="min-h-0 flex-1 gap-0"
        onValueChange={(value) => setActiveTab(value)}
        value={activeTab}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-border border-b px-6 py-5">
          <div>
            <h1 className="font-semibold text-2xl text-foreground">Recorded activity</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {formatCount(data.toolCalls.length, "tool call")},{" "}
              {formatCount(otherItems.length, "other event")} across{" "}
              {formatCount(data.sessions.length, "session")}
            </p>
            <TabsList className="mt-4" variant="line">
              <ActivityTabTrigger value="tool-calls">Tool calls</ActivityTabTrigger>
              <ActivityTabTrigger value="other">Other</ActivityTabTrigger>
            </TabsList>
          </div>
          <Button
            disabled={!onRefresh || isRefreshing}
            onClick={() => void onRefresh?.()}
            type="button"
            variant="outline"
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </header>
        <main className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-4 border-border border-r p-4">
            {activeTab === "tool-calls" ? (
              <ToolCallFilters
                filterOptions={filterOptions}
                filters={filters}
                groupBy={groupBy}
                onFiltersChange={setFilters}
                onGroupByChange={setGroupBy}
              />
            ) : (
              <OtherActivityFilters
                filterOptions={otherFilterOptions}
                filters={otherFilters}
                onFiltersChange={setOtherFilters}
              />
            )}
          </aside>
          <ScrollArea className="min-h-0">
            <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-7 pb-32 pt-8">
              <GalleryWarnings count={data.warnings.length} />
              <TabsContent className="mt-0 space-y-6" value="tool-calls">
                {visibleItems.length === 0 ? (
                  <EmptyActivity>No recorded tool calls match the current filters.</EmptyActivity>
                ) : (
                  groupedItems.map((group) => (
                    <ToolCallGroup
                      forcedInProgressIds={forcedInProgressIds}
                      group={group}
                      key={group.key}
                      onForceInProgressChange={toggleForcedInProgress}
                      showHeading={groupBy !== "none"}
                    />
                  ))
                )}
              </TabsContent>
              <TabsContent className="mt-0 space-y-2" value="other">
                {visibleOtherItems.length === 0 ? (
                  <EmptyActivity>No recorded other events match the current filters.</EmptyActivity>
                ) : (
                  visibleOtherItems.map((item, index) => (
                    <OtherActivityRow
                      item={item}
                      key={`${item.activityKind}:${item.sessionId}:${item.requestId ?? "event"}:${index}`}
                    />
                  ))
                )}
              </TabsContent>
            </section>
          </ScrollArea>
        </main>
      </Tabs>
    </ToolCallGalleryShell>
  );
}

function ToolCallGalleryShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">{children}</div>
  );
}

function ActivityTabTrigger({
  children,
  value,
}: {
  children: React.ReactNode;
  value: string;
}): React.ReactElement {
  return (
    <TabsTrigger
      className="rounded-md px-3 py-1.5 font-medium text-muted-foreground text-sm transition-colors data-active:bg-muted data-active:text-foreground"
      value={value}
    >
      {children}
    </TabsTrigger>
  );
}

function GalleryWarnings({ count }: { count: number }): React.ReactElement | null {
  if (count === 0) return null;
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-muted-foreground text-sm">
      {formatCount(count, "warning")} while reading recordings.
    </div>
  );
}

function ToolCallFilters({
  filterOptions,
  filters,
  groupBy,
  onFiltersChange,
  onGroupByChange,
}: {
  filterOptions: ReturnType<typeof buildToolCallGalleryFilters>;
  filters: ToolCallGalleryFilters;
  groupBy: ToolCallGroupBy;
  onFiltersChange: React.Dispatch<React.SetStateAction<ToolCallGalleryFilters>>;
  onGroupByChange: (value: ToolCallGroupBy) => void;
}): React.ReactElement {
  return (
    <>
      <FilterSelect
        label="Provider"
        onValueChange={(provider) => onFiltersChange((current) => ({ ...current, provider }))}
        options={filterOptions.providers}
        value={filters.provider}
      />
      <FilterSelect
        label="Session"
        onValueChange={(sessionId) => onFiltersChange((current) => ({ ...current, sessionId }))}
        options={filterOptions.sessions}
        value={filters.sessionId}
      />
      <FilterSelect
        label="Kind"
        onValueChange={(kind) => onFiltersChange((current) => ({ ...current, kind }))}
        options={filterOptions.kinds}
        value={filters.kind}
      />
      <FilterSelect
        label="State"
        onValueChange={(state) => onFiltersChange((current) => ({ ...current, state }))}
        options={filterOptions.states}
        value={filters.state}
      />
      <FilterSelect
        label="Group"
        onValueChange={(value) => {
          if (value === "none" || value === "kind") onGroupByChange(value);
        }}
        options={["kind"]}
        value={groupBy}
      />
      <SearchFilter
        ariaLabel="Search recorded tool calls"
        onChange={(query) => onFiltersChange((current) => ({ ...current, query }))}
        value={filters.query}
      />
    </>
  );
}

function OtherActivityFilters({
  filterOptions,
  filters,
  onFiltersChange,
}: {
  filterOptions: ReturnType<typeof buildOtherActivityFilters>;
  filters: OtherActivityFilters;
  onFiltersChange: React.Dispatch<React.SetStateAction<OtherActivityFilters>>;
}): React.ReactElement {
  return (
    <>
      <FilterSelect
        label="Type"
        onValueChange={(kind) => onFiltersChange((current) => ({ ...current, kind }))}
        options={filterOptions.kinds}
        value={filters.kind}
      />
      <FilterSelect
        label="Provider"
        onValueChange={(provider) => onFiltersChange((current) => ({ ...current, provider }))}
        options={filterOptions.providers}
        value={filters.provider}
      />
      <FilterSelect
        label="Session"
        onValueChange={(sessionId) => onFiltersChange((current) => ({ ...current, sessionId }))}
        options={filterOptions.sessions}
        value={filters.sessionId}
      />
      <SearchFilter
        ariaLabel="Search recorded other events"
        onChange={(query) => onFiltersChange((current) => ({ ...current, query }))}
        value={filters.query}
      />
    </>
  );
}

function ToolCallGroup({
  forcedInProgressIds,
  group,
  onForceInProgressChange,
  showHeading,
}: {
  forcedInProgressIds: ReadonlySet<string>;
  group: ReturnType<typeof groupToolCallGalleryItems>[number];
  onForceInProgressChange: (itemKey: string, enabled: boolean) => void;
  showHeading: boolean;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      {showHeading ? (
        <div className="flex items-center gap-2 border-border/60 border-b pb-2">
          <h2 className="font-medium text-foreground text-sm">{group.label}</h2>
          <Badge variant="outline">{formatCount(group.items.length, "call")}</Badge>
        </div>
      ) : null}
      <div className="space-y-0">
        {group.items.map((item) => (
          <ToolCallGalleryRow
            forceInProgress={forcedInProgressIds.has(getToolCallItemKey(item))}
            item={item}
            key={getToolCallItemKey(item)}
            onForceInProgressChange={(enabled) =>
              onForceInProgressChange(getToolCallItemKey(item), enabled)
            }
          />
        ))}
      </div>
    </section>
  );
}

function ToolCallGalleryRow({
  forceInProgress,
  item,
  onForceInProgressChange,
}: {
  forceInProgress: boolean;
  item: RecordedToolCallGalleryItem;
  onForceInProgressChange: (enabled: boolean) => void;
}): React.ReactElement {
  const displayState = forceInProgress ? "in-progress" : getToolCallDisplayState(item);
  return (
    <article className="space-y-2 border-border/60 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <Badge variant="secondary">{item.provider ?? "unknown provider"}</Badge>
          <Badge variant="outline">{item.toolKind ?? "unknown kind"}</Badge>
          <Badge variant="outline">{formatState(displayState)}</Badge>
          <span>{item.sessionId}</span>
          <span>{formatDateTime(item.timestamp)}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-muted-foreground text-xs">
            <span>In progress</span>
            <Switch
              aria-label={`Force ${item.toolTitle ?? item.toolCallId} in progress`}
              checked={forceInProgress}
              onCheckedChange={onForceInProgressChange}
              size="sm"
            />
          </label>
          <PayloadDialog events={item.sourceEvents} title="Tool call payload" />
        </div>
      </div>
      <CompactToolCall
        defaultOpen={false}
        tool={toChatToolCall(item, forceInProgress ? "input-available" : undefined)}
      />
    </article>
  );
}

function OtherActivityRow({ item }: { item: RecordedOtherGalleryItem }): React.ReactElement {
  return item.activityKind === "thinking" ? (
    <ThinkingRow item={item} />
  ) : (
    <CancellationRow item={item} />
  );
}

function ThinkingRow({ item }: { item: RecordedThinkingGalleryItem }): React.ReactElement {
  return (
    <article className="space-y-2 border-border/60 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActivityMetadata
          provider={item.provider}
          sessionId={item.sessionId}
          timestamp={item.timestamp}
        >
          <Badge variant="outline">thinking</Badge>
          <Badge variant="outline">{formatCount(item.eventCount, "chunk")}</Badge>
        </ActivityMetadata>
        <PayloadDialog events={item.sourceEvents} title="Thinking payload" />
      </div>
      <CompactReasoning
        defaultOpen={false}
        endedAt={undefined}
        isActive
        startedAt={item.firstTimestamp}
        text={item.text}
      />
    </article>
  );
}

function CancellationRow({ item }: { item: RecordedCancellationGalleryItem }): React.ReactElement {
  return (
    <article className="space-y-2 border-border/60 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActivityMetadata
          provider={item.provider}
          sessionId={item.sessionId}
          timestamp={item.timestamp}
        >
          <Badge variant="outline">cancellation</Badge>
          <Badge variant="outline">{item.method ?? "cancelled"}</Badge>
          {item.direction ? <Badge variant="outline">{item.direction}</Badge> : null}
        </ActivityMetadata>
        <PayloadDialog events={item.sourceEvents} title="Cancellation payload" />
      </div>
      <p className="text-foreground text-sm leading-6">
        {item.reason ? `Stopped because ${item.reason}.` : "User cancellation requested."}
      </p>
    </article>
  );
}

function PayloadDialog({
  events,
  title,
}: {
  events: readonly RecordedActivitySourceEvent[];
  title: string;
}): React.ReactElement {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" type="button" variant="ghost" />}>
        <Braces className="size-3.5" />
        Payload
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] rounded-md border border-border">
          <pre className="overflow-x-auto p-3 text-xs leading-5">
            {JSON.stringify(events.length === 1 ? events[0] : events, null, 2)}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ActivityMetadata({
  children,
  provider,
  sessionId,
  timestamp,
}: {
  children?: React.ReactNode;
  provider?: string;
  sessionId: string;
  timestamp: string;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
      <Badge variant="secondary">{provider ?? "unknown provider"}</Badge>
      {children}
      <span>{sessionId}</span>
      <span>{formatDateTime(timestamp)}</span>
    </div>
  );
}

function EmptyActivity({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-md border border-border p-8 text-center text-muted-foreground">
      {children}
    </div>
  );
}

function SearchFilter({
  ariaLabel,
  onChange,
  value,
}: {
  ariaLabel: string;
  onChange: (value: string) => void;
  value: string;
}): React.ReactElement {
  return (
    <label className="block space-y-2">
      <span className="font-medium text-muted-foreground text-xs uppercase">Search</span>
      <Input
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="block space-y-2">
      <span className="font-medium text-muted-foreground text-xs uppercase">{label}</span>
      <Select
        onValueChange={(nextValue) => {
          if (nextValue !== null) {
            onValueChange(nextValue);
          }
        }}
        value={value}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={label === "Group" ? "none" : "all"}>
            {label === "Group" ? "None" : "All"}
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {label === "State" ? formatState(option) : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function emptyResponse(): ToolCallGalleryResponse {
  return {
    generatedAt: new Date().toISOString(),
    sessions: [],
    toolCalls: [],
    thinking: [],
    cancellations: [],
    warnings: [],
  };
}

function formatCount(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

function formatState(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getToolCallItemKey(item: RecordedToolCallGalleryItem): string {
  return `${item.sessionId}:${item.toolCallId}`;
}
