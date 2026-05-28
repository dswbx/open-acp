import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Clipboard, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipInline, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { SmokeProvider } from "../../shared/providerModels.ts";
import { getSmokeProviderLabel } from "../../shared/providerModels.ts";
import type { WorkspaceSummary } from "../../shared/workspaces.ts";
import dayjs from "dayjs";
import { ProviderIcon } from "./ProviderIcon.tsx";

export interface SessionListItem {
  id: string;
  workspaceId?: string;
  provider: SmokeProvider;
  title: string;
  model: string;
  contextWindow: string;
  cwd: string;
  createdAt?: string;
  lastTurnAt?: string;
  gitBranch?: string;
  gitStatusSummary?: string;
}

interface SessionListPanelProps {
  sessions: SessionListItem[];
  workspaces: WorkspaceSummary[];
  onCreateWorkspace: () => void;
  onCreateSession: (workspaceId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onRenameSession?: (session: SessionListItem) => void;
  onDeleteSession?: (session: SessionListItem) => void;
  onCopySessionId?: (session: SessionListItem) => void;
  activeWorkspaceId?: string;
  activeSessionId?: string;
  disabled?: boolean;
  showCopySessionId?: boolean;
}

interface SessionListPanelState {
  expandedWorkspaceIds: string[];
}

export class SessionListPanel extends React.Component<
  SessionListPanelProps,
  SessionListPanelState
> {
  constructor(props: SessionListPanelProps) {
    super(props);
    this.state = {
      expandedWorkspaceIds: props.workspaces.map((workspace) => workspace.id),
    };
  }

  componentDidMount(): void {
    this.ensureWorkspacesExpanded();
  }

  componentDidUpdate(prevProps: SessionListPanelProps): void {
    if (prevProps.workspaces !== this.props.workspaces) {
      this.ensureWorkspacesExpanded();
    }
  }

  private ensureWorkspacesExpanded(): void {
    this.setState((state) => ({
      expandedWorkspaceIds: [
        ...state.expandedWorkspaceIds,
        ...this.props.workspaces
          .map((workspace) => workspace.id)
          .filter((id) => !state.expandedWorkspaceIds.includes(id)),
      ],
    }));
  }

  private toggleWorkspace(workspaceId: string): void {
    this.setState((state) => ({
      expandedWorkspaceIds: state.expandedWorkspaceIds.includes(workspaceId)
        ? state.expandedWorkspaceIds.filter((id) => id !== workspaceId)
        : [...state.expandedWorkspaceIds, workspaceId],
    }));
  }

  render(): React.ReactNode {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-r-lg border-r border-border bg-card/40 p-2 shadow-sm">
        <div
          className="mb-2 flex items-center justify-between electrobun-webkit-app-region-drag"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <h2 className="sr-only">Workspaces</h2>
          <div />
          <div
            className="electrobun-webkit-app-region-no-drag"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <TooltipInline content="New workspace" align="start" side="left" delay={50}>
              <Button
                aria-label="New workspace"
                disabled={this.props.disabled}
                onClick={this.props.onCreateWorkspace}
                variant="outline"
                size="icon"
              >
                <Plus />
                <span className="sr-only">New workspace</span>
              </Button>
            </TooltipInline>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1">
            {this.props.workspaces.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                No workspaces yet. Click New workspace to start.
              </div>
            ) : (
              this.props.workspaces.map((workspace) => this.renderWorkspace(workspace))
            )}
          </div>
        </div>
      </section>
    );
  }

  private renderWorkspace(workspace: WorkspaceSummary): React.ReactNode {
    const isExpanded = this.state.expandedWorkspaceIds.includes(workspace.id);
    const sessions = this.props.sessions
      .filter((session) => session.workspaceId === workspace.id)
      .map((session, index) => ({ session, index }))
      .sort(compareSessionEntriesByCreatedAt)
      .map((entry) => entry.session);
    const isActive = this.props.activeWorkspaceId === workspace.id;
    const ToggleIcon = isExpanded ? ChevronDown : ChevronRight;

    return (
      <div key={workspace.id} className="rounded-md">
        <div className="flex items-center gap-1">
          <Button
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${workspace.name}`}
            className="h-8 w-8 shrink-0"
            onClick={() => this.toggleWorkspace(workspace.id)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ToggleIcon />
          </Button>
          <Tooltip>
            <TooltipTrigger className="min-w-0 flex-1">
              <Button
                className="h-8 w-full min-w-0 justify-start gap-2 px-2"
                data-active={isActive ? "true" : "false"}
                onClick={() => this.props.onSelectWorkspace(workspace.id)}
                type="button"
                variant={isActive ? "secondary" : "ghost"}
              >
                <Folder className="h-4 w-4 shrink-0" />
                <span className="truncate">{workspace.name}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-sm">
                <h3 className="font-medium">{workspace.name}</h3>
                <p className="text-sm opacity-50">{workspace.rootPath}</p>
              </div>
            </TooltipContent>
          </Tooltip>
          <TooltipInline content="New session" side="right" delay={50}>
            <Button
              aria-label={`New session in ${workspace.name}`}
              className="h-8 w-8 shrink-0"
              disabled={this.props.disabled}
              onClick={() => this.props.onCreateSession(workspace.id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus />
            </Button>
          </TooltipInline>
        </div>
        {isExpanded ? (
          <div className="ml-8 mt-1 flex flex-col gap-px">
            {sessions.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">No sessions yet.</div>
            ) : (
              sessions.map((session) => this.renderSession(session))
            )}
          </div>
        ) : null}
      </div>
    );
  }

  private renderSession(session: SessionListItem): React.ReactNode {
    const isActive = this.props.activeSessionId === session.id;
    const providerLabel = getSmokeProviderLabel(session.provider);
    return (
      <ContextMenu key={session.id}>
        <ContextMenuTrigger className="w-full">
          <Tooltip>
            <TooltipTrigger className="w-full">
              <Button
                className="h-14 w-full min-w-0 flex-col items-start justify-center gap-px px-3"
                size="lg"
                variant={isActive ? "secondary" : "ghost"}
                data-active={isActive ? "true" : "false"}
                data-session-id={session.id}
                aria-current={isActive ? "page" : undefined}
                aria-label={`${session.title}, ${providerLabel}`}
                onClick={() => {
                  this.props.onSelectSession(session.id);
                }}
                type="button"
              >
                <span className="flex max-w-full items-center gap-2">
                  <ProviderIcon provider={session.provider} size={14} />
                  <span className="truncate">{session.title}</span>
                </span>
                {isActive ? <span className="sr-only">Active</span> : null}
                <span className="sr-only">{providerLabel}</span>
                <span className="max-w-full truncate text-sm text-muted-foreground">
                  {getSessionSubtitle(session)}
                </span>
                <span className="sr-only">{session.cwd}</span>
                {session.gitBranch ? <span className="sr-only">{session.gitBranch}</span> : null}
                {session.gitStatusSummary ? (
                  <span className="sr-only">{session.gitStatusSummary}</span>
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-sm">
                <h3 className="flex items-center gap-2 font-medium">
                  <ProviderIcon provider={session.provider} size={14} />
                  <span>{session.title}</span>
                </h3>
                <p>{providerLabel}</p>
                <p>{session.model}</p>
                <p>Context {session.contextWindow}</p>
                <p className="text-sm opacity-50">{session.cwd}</p>
                <p className="text-sm opacity-50">{getSessionSubtitle(session)}</p>
                {session.gitStatusSummary ? (
                  <p className="text-sm opacity-50">{session.gitStatusSummary}</p>
                ) : null}
              </div>
            </TooltipContent>
          </Tooltip>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem
            onClick={() => {
              this.props.onRenameSession?.(session);
            }}
          >
            <Pencil />
            Rename
          </ContextMenuItem>
          {this.props.showCopySessionId ? (
            <ContextMenuItem
              onClick={() => {
                this.props.onCopySessionId?.(session);
              }}
            >
              <Clipboard />
              Copy session ID
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              this.props.onDeleteSession?.(session);
            }}
            variant="destructive"
          >
            <Trash2 />
            Delete session
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }
}

function compareSessionEntriesByCreatedAt(
  left: { session: SessionListItem; index: number },
  right: { session: SessionListItem; index: number },
): number {
  const leftTime = parseTimestamp(left.session.createdAt);
  const rightTime = parseTimestamp(right.session.createdAt);
  if (leftTime !== rightTime) return rightTime - leftTime;
  return left.index - right.index;
}

function parseTimestamp(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getSessionSubtitle(session: SessionListItem): string {
  const branch = session.gitBranch?.trim() || "No branch";
  return `${branch} • ${formatLastTurnAge(session.lastTurnAt ?? session.createdAt)}`;
}

function formatLastTurnAge(value: string | undefined): string {
  const timestamp = dayjs(value);
  if (!value || !timestamp.isValid()) return "now";

  const now = dayjs();
  const minutes = now.diff(timestamp, "minute");
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes}m`;

  const hours = now.diff(timestamp, "hour");
  if (hours < 24) return `${hours}h`;

  return `${now.diff(timestamp, "day")}d`;
}
