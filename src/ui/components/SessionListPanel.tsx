import React from "react";
import type {
  ProviderModelOption,
  SmokeProvider
} from "../../shared/AppRPC.ts";
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
  onSelectModel: (model: string) => void;
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  selectedModel: string;
  modelOptions: ProviderModelOption[];
  modelHelperText?: string;
  isDraftingSession: boolean;
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
            label={this.props.isDraftingSession ? "Create session" : "New session"}
            onClick={this.props.onCreateSession}
            disabled={this.props.disabled}
          />
        </div>
        <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Provider
            <select
              aria-label="Provider"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              data-provider-locked={this.props.isDraftingSession ? "false" : "true"}
              disabled={this.props.disabled || !this.props.isDraftingSession}
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

          <label className="block text-xs font-medium text-muted-foreground">
            Model
            <select
              aria-label="Model"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              disabled={this.props.disabled}
              onChange={(event) => this.props.onSelectModel(event.target.value)}
              value={this.props.selectedModel}
            >
              <option value="">Default model</option>
              {this.props.modelOptions.map((modelOption) => (
                <option key={modelOption.id} value={modelOption.id}>
                  {modelOption.title ?? modelOption.id}
                </option>
              ))}
            </select>
          </label>

          {this.props.modelHelperText ? (
            <p className="text-xs text-muted-foreground">{this.props.modelHelperText}</p>
          ) : null}
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
