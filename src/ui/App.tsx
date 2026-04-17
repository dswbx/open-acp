import React from "react";
import { InspectorPanel } from "./components/InspectorPanel.tsx";
import {
  SessionListPanel,
  type SessionListItem
} from "./components/SessionListPanel.tsx";
import {
  TranscriptPanel,
  type TranscriptEntry
} from "./components/TranscriptPanel.tsx";

interface AppState {
  sessions: SessionListItem[];
  transcript: TranscriptEntry[];
}

export class App extends React.Component<Record<string, never>, AppState> {
  constructor(props: Record<string, never>) {
    super(props);
    this.state = {
      sessions: [
        {
          id: "session-1",
          title: "Claude: Implement ACP Orchestrator",
          model: "claude-sonnet-4.6",
          contextWindow: "200k"
        }
      ],
      transcript: [
        {
          id: "t1",
          author: "user",
          text: "Create a session orchestration service that can route agent updates."
        },
        {
          id: "t2",
          author: "agent",
          text: "Implemented a class-based SessionOrchestrator with adapter routing and update subscriptions."
        }
      ]
    };
  }

  private readonly handleCreateSession = (): void => {
    const nextIndex = this.state.sessions.length + 1;
    this.setState({
      sessions: [
        ...this.state.sessions,
        {
          id: `session-${nextIndex}`,
          title: `Claude session ${nextIndex}`,
          model: "claude-sonnet-4.6",
          contextWindow: "unknown"
        }
      ]
    });
  };

  render(): React.ReactNode {
    return (
      <main className="min-h-screen bg-zinc-50 p-6 text-zinc-900">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Agent Orchestrator</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Claude-first ACP orchestration shell with pluggable adapter support.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
          <SessionListPanel
            onCreateSession={this.handleCreateSession}
            sessions={this.state.sessions}
          />
          <TranscriptPanel entries={this.state.transcript} />
          <InspectorPanel
            contextWindow="200k tokens"
            modelName="claude-sonnet-4.6"
            onRetry={() => {}}
            onStop={() => {}}
          />
        </section>
      </main>
    );
  }
}

