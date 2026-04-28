import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipInline, TooltipTrigger } from "@/components/ui/tooltip";

export interface SessionListItem {
  id: string;
  title: string;
  model: string;
  contextWindow: string;
  cwd: string;
  gitBranch?: string;
  gitStatusSummary?: string;
}

interface SessionListPanelProps {
  sessions: SessionListItem[];
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  activeSessionId?: string;
  disabled?: boolean;
}

export class SessionListPanel extends React.Component<SessionListPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-r-lg border-r border-border bg-card/40 p-2 shadow-sm">
        <div
          className="mb-2 flex items-center justify-between electrobun-webkit-app-region-drag"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <h2 className="sr-only">Sessions</h2>
          <div />
          <div
            className="electrobun-webkit-app-region-no-drag"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <TooltipInline content="New session" align="start" side="left" delay={50}>
              <Button
                aria-label="New session"
                disabled={this.props.disabled}
                onClick={this.props.onCreateSession}
                variant="outline"
                size="icon"
              >
                <Plus />
                <span className="sr-only">New session</span>
              </Button>
            </TooltipInline>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-px">
            {this.props.sessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                No sessions yet. Click New session to start.
              </div>
            ) : (
              this.props.sessions.map((session) => {
                const isActive = this.props.activeSessionId === session.id;
                return (
                  <div key={session.id}>
                    <Tooltip>
                      <TooltipTrigger className="w-full">
                        <Button
                          className="w-full flex flex-col items-start justify-center gap-px h-15 min-w-0 pl-3"
                          size="lg"
                          variant={isActive ? "secondary" : "ghost"}
                          data-active={isActive ? "true" : "false"}
                          data-session-id={session.id}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => {
                            this.props.onSelectSession(session.id);
                          }}
                          type="button"
                        >
                          <span>{session.title}</span>
                          {isActive ? <span className="sr-only">Active</span> : null}
                          <span className="text-xs text-muted-foreground truncate max-w-full">
                            {session.cwd}
                          </span>
                          {session.gitBranch ? (
                            <span className="sr-only">{session.gitBranch}</span>
                          ) : null}
                          {session.gitStatusSummary ? (
                            <span className="sr-only">{session.gitStatusSummary}</span>
                          ) : null}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <div className="text-xs">
                          <h3 className="text-sm font-medium">{session.title}</h3>
                          <p>{session.model}</p>
                          <p>Context {session.contextWindow}</p>
                          <p className="text-xs opacity-50">{session.cwd}</p>
                          {session.gitBranch ? (
                            <p className="text-xs opacity-50">{session.gitBranch}</p>
                          ) : null}
                          {session.gitStatusSummary ? (
                            <p className="text-xs opacity-50">{session.gitStatusSummary}</p>
                          ) : null}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    );
  }
}
