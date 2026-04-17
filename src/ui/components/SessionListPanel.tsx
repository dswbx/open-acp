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
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">
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
              className="rounded-md border border-zinc-200 p-3"
              key={session.id}
            >
              <div className="text-sm font-medium text-zinc-900">
                {session.title}
              </div>
              <div className="mt-1 text-xs text-zinc-600">
                {session.model} · Context {session.contextWindow}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }
}

