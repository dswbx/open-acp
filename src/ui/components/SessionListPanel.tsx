import React from "react";
import type { SmokeProvider } from "../../shared/AppRPC.ts";
import { PrimaryButton } from "./ui/PrimaryButton.tsx";

export interface SessionListItem {
  id: string;
  title: string;
  model: string;
  contextWindow: string;
}

interface SessionListPanelProps {
  sessions: SessionListItem[];
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onSelectProvider: (provider: SmokeProvider) => void;
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  isDraftingSession: boolean;
  disabled?: boolean;
}

export class SessionListPanel extends React.Component<SessionListPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions
          </h2>
          <PrimaryButton
            label={this.props.isDraftingSession ? "Create session" : "New session"}
            onClick={this.props.onCreateSession}
            disabled={this.props.disabled}
          />
        </div>
        {this.props.isDraftingSession ? (
          <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <label className="block text-xs font-medium text-muted-foreground">
              Provider
              <select
                aria-label="Provider"
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
                data-provider-locked="false"
                disabled={this.props.disabled}
                onChange={(event) =>
                  this.props.onSelectProvider(event.target.value as SmokeProvider)
                }
                value={this.props.selectedProvider}
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
                <option value="opencode">OpenCode</option>
              </select>
            </label>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ul className="space-y-3">
            {this.props.sessions.length === 0 ? (
              <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                No sessions yet. Click New session to start.
              </li>
            ) : (
              this.props.sessions.map((session) => {
                const isActive = this.props.activeSessionId === session.id;
                return (
                  <li key={session.id}>
                    <button
                      aria-current={isActive ? "page" : undefined}
                      aria-pressed={isActive}
                      className={`w-full rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        isActive
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:bg-muted/60"
                      }`}
                      data-active={isActive ? "true" : "false"}
                      data-session-id={session.id}
                      disabled={this.props.disabled}
                      onClick={() => {
                        this.props.onSelectSession(session.id);
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-card-foreground">
                          {session.title}
                        </div>
                        {isActive ? (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Active
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {session.model} · Context {session.contextWindow}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </section>
    );
  }
}
