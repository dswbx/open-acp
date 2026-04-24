import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, RefreshCw } from "lucide-react";
import type {
  RecordedToolCallGalleryItem,
  ToolCallGalleryResponse,
} from "../../../shared/toolCallGallery.ts";
import { CompactToolCall } from "../../components/CompactToolCall.tsx";
import {
  DEFAULT_TOOL_CALL_GALLERY_FILTERS,
  buildToolCallGalleryFilters,
  filterToolCallGalleryItems,
  toChatToolCall,
  type ToolCallGalleryFilters,
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
  const filterOptions = React.useMemo(
    () => buildToolCallGalleryFilters(data.toolCalls),
    [data.toolCalls],
  );
  const visibleItems = React.useMemo(
    () => filterToolCallGalleryItems(data.toolCalls, filters),
    [data.toolCalls, filters],
  );

  return (
    <ToolCallGalleryShell>
      <header className="flex flex-wrap items-start justify-between gap-4 border-border border-b px-6 py-5">
        <div>
          <h1 className="font-semibold text-2xl text-foreground">Tool calls</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {formatCount(data.toolCalls.length, "call")} across{" "}
            {formatCount(data.sessions.length, "session")}
          </p>
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
          <FilterSelect
            label="Provider"
            onValueChange={(provider) => setFilters((current) => ({ ...current, provider }))}
            options={filterOptions.providers}
            value={filters.provider}
          />
          <FilterSelect
            label="Session"
            onValueChange={(sessionId) => setFilters((current) => ({ ...current, sessionId }))}
            options={filterOptions.sessions}
            value={filters.sessionId}
          />
          <FilterSelect
            label="Kind"
            onValueChange={(kind) => setFilters((current) => ({ ...current, kind }))}
            options={filterOptions.kinds}
            value={filters.kind}
          />
          <FilterSelect
            label="State"
            onValueChange={(state) => setFilters((current) => ({ ...current, state }))}
            options={filterOptions.states}
            value={filters.state}
          />
          <label className="block space-y-2">
            <span className="font-medium text-muted-foreground text-xs uppercase">Search</span>
            <Input
              aria-label="Search recorded tool calls"
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              value={filters.query}
            />
          </label>
        </aside>
        <ScrollArea className="min-h-0">
          <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-6">
            {data.warnings.length > 0 ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-muted-foreground text-sm">
                {formatCount(data.warnings.length, "warning")} while reading recordings.
              </div>
            ) : null}
            {visibleItems.length === 0 ? (
              <div className="rounded-md border border-border p-8 text-center text-muted-foreground">
                No recorded tool calls match the current filters.
              </div>
            ) : (
              visibleItems.map((item) => (
                <ToolCallGalleryRow item={item} key={`${item.sessionId}:${item.toolCallId}`} />
              ))
            )}
          </section>
        </ScrollArea>
      </main>
    </ToolCallGalleryShell>
  );
}

function ToolCallGalleryShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">{children}</div>
  );
}

function ToolCallGalleryRow({ item }: { item: RecordedToolCallGalleryItem }): React.ReactElement {
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <Badge variant="secondary">{item.provider ?? "unknown provider"}</Badge>
        <Badge variant="outline">{item.toolKind ?? "unknown kind"}</Badge>
        <Badge variant="outline">{item.toolState ?? "unknown state"}</Badge>
        <span>{item.sessionId}</span>
        <span>{formatDateTime(item.timestamp)}</span>
      </div>
      <CompactToolCall defaultOpen={false} tool={toChatToolCall(item)} />
    </article>
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
          <SelectItem value="all">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
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
