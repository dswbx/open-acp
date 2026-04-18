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
  componentDidMount(): void {
    window.addEventListener("mouseup", this.handleWindowDragEnd);
  }

  componentWillUnmount(): void {
    window.removeEventListener("mouseup", this.handleWindowDragEnd);
  }

  constructor(props: Record<string, never>) {
    super(props);
    this.state = {
      sessions: [
        {
          id: "session-1",
          title: "Claude: Implement ACP Orchestrator",
          model: "claude-sonnet-4.6",
          contextWindow: "200k",
          cwd: "/workspace/open-acp"
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

  private readonly sendWindowMoveMessage = (
    messageId: "startWindowMove" | "stopWindowMove"
  ): void => {
    const electrobunWindow = window as Window & {
      __electrobunInternalBridge?: { postMessage: (message: string) => void };
      __electrobunWindowId?: number;
    };
    const windowId = electrobunWindow.__electrobunWindowId;
    const bridge = electrobunWindow.__electrobunInternalBridge;
    if (windowId === undefined || bridge === undefined) {
      return;
    }

    const message = JSON.stringify({
      type: "message",
      id: messageId,
      payload: { id: windowId }
    });
    bridge.postMessage(JSON.stringify([message]));
  };

  private readonly handleHeaderMouseDown = (
    event: React.MouseEvent<HTMLElement>
  ): void => {
    if (event.button !== 0) {
      return;
    }
    this.sendWindowMoveMessage("startWindowMove");
  };

  private readonly handleWindowDragEnd = (): void => {
    this.sendWindowMoveMessage("stopWindowMove");
  };

  private readonly handleCreateSession = (): void => {
    const nextIndex = this.state.sessions.length + 1;
    const providerLabel = "Codex";
    this.setState({
      sessions: [
        {
          id: `session-${nextIndex}`,
          title: `${providerLabel} session ${nextIndex}`,
          model: providerLabel,
          contextWindow: "unknown",
          cwd: `/workspace/session-${nextIndex}`
        },
        ...this.state.sessions
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
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-50 px-6 pb-6 pt-4 text-zinc-900">
        <header
          className="electrobun-webkit-app-region-drag mb-6 flex-none rounded-xl border border-zinc-200/80 bg-white/80 px-5 pb-4 pt-8 shadow-sm backdrop-blur"
          onMouseDown={this.handleHeaderMouseDown}
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <h1
            className="electrobun-webkit-app-region-drag pl-16 text-2xl font-semibold"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          >
            Agent Orchestrator
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            <span
              className="electrobun-webkit-app-region-drag pl-16"
              style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
            >
              Claude-first ACP orchestration shell with pluggable adapter support.
            </span>
          </p>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
          <SessionListPanel
            activeSessionId={this.state.activeSessionId}
            onCreateSession={this.handleCreateSession}
            onSelectSession={this.handleSelectSession}
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
