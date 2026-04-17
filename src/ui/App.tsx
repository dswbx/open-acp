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
  activeSessionId?: string;
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
      activeSessionId: "session-1",
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
      ],
      activeSessionId: `session-${nextIndex}`
    });
  };

  private readonly handleSelectSession = (sessionId: string): void => {
    this.setState({
      activeSessionId: sessionId
    });
  };

  render(): React.ReactNode {
    return (
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-50 p-6 text-zinc-900">
        <header className="mb-6 flex-none">
          <h1 className="text-2xl font-semibold">Agent Orchestrator</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Claude-first ACP orchestration shell with pluggable adapter support.
          </p>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
          <SessionListPanel
            activeSessionId={this.state.activeSessionId}
            isDraftingSession={false}
            onCreateSession={this.handleCreateSession}
            onSelectProvider={() => {}}
            onSelectSession={this.handleSelectSession}
            selectedProvider="claude"
            sessions={this.state.sessions}
          />
          <TranscriptPanel entries={this.state.transcript} />
          <InspectorPanel
            contextWindow="200k tokens"
            activeRequestId={undefined}
            canRetry={false}
            canStop={false}
            isStopping={false}
            isWorking={false}
            modelName="claude-sonnet-4.6"
            onRetry={() => {}}
            onStop={() => {}}
            pendingApprovalCount={0}
            transcriptEntries={[]}
          />
        </section>
      </main>
    );
  }
}
