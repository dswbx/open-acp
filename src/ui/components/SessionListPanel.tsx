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
          />
        </div>
        <ul className="space-y-3">
          {this.props.sessions.map((session) => (
            <li
              className="rounded-md border border-border p-3"
              key={session.id}
            >
              <div className="text-sm font-medium text-card-foreground">
                {session.title}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {session.model} · Context {session.contextWindow}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }
}
