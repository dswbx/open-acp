import React from "react";
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
  activeSessionId?: string;
  disabled?: boolean;
}

export class SessionListPanel extends React.Component<SessionListPanelProps> {
  render(): React.ReactNode {
    return (
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions
          </h2>
          <PrimaryButton
            label="New session"
            onClick={this.props.onCreateSession}
            disabled={this.props.disabled}
          />
        </div>
        <ul className="space-y-3">
          {this.props.sessions.length === 0 ? (
            <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No sessions yet. Create one to start.
            </li>
          ) : (
            this.props.sessions.map((session) => {
              const isActive = this.props.activeSessionId === session.id;
              return (
                <li key={session.id}>
                  <button
                    aria-pressed={isActive}
                    className={`w-full rounded-md border p-3 text-left transition ${
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/60"
                    }`}
                    data-session-id={session.id}
                    disabled={this.props.disabled}
                    onClick={() => {
                      this.props.onSelectSession(session.id);
                    }}
                    type="button"
                  >
                    <div className="text-sm font-medium text-card-foreground">
                      {session.title}
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
      </section>
    );
  }
}
