import React from "react";
import { InspectorPanel } from "../ui/components/InspectorPanel.tsx";
import {
  SessionListPanel,
  type SessionListItem
} from "../ui/components/SessionListPanel.tsx";
import { PrimaryButton } from "../ui/components/ui/PrimaryButton.tsx";
import type { SmokeProvider } from "../shared/AppRPC.ts";
import type { ChatMessage } from "./chat/types.ts";
import { ChatSurface } from "./components/ChatSurface.tsx";
import { NoopSmokeBridge, type SmokeBridge, type SmokeBridgeEvent } from "./bridge/SmokeBridge.ts";
import {
  readStoredThemePreference,
  resolveThemeMode,
  writeStoredThemePreference,
  type ThemeMode,
  type ThemePreference
} from "./theme/themePreference.ts";

interface AppProps {
  smokeBridge?: SmokeBridge;
}

interface SmokeLogLine {
  id: string;
  level: "info" | "update" | "error";
  message: string;
  provider: SmokeProvider;
  timestamp: string;
}

interface AppState {
  sessions: SessionListItem[];
  chatMessages: ChatMessage[];
  chatInput: string;
  selectedModels: Record<SmokeProvider, string>;
  isSending: boolean;
  activeRequestId?: string;
  activeSessionId?: string;
  selectedProvider: SmokeProvider;
  logs: SmokeLogLine[];
  themePreference: ThemePreference;
  themeMode: ThemeMode;
}

const PROVIDER_MODELS: Record<SmokeProvider, readonly string[]> = {
  codex: [
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.2",
    "gpt-5-mini"
  ],
  claude: [
    "claude-sonnet-4.6",
    "claude-sonnet-4.5",
    "claude-haiku-4.5",
    "claude-opus-4.6"
  ],
  opencode: [
    "openrouter/anthropic/claude-sonnet-4.5",
    "openrouter/openai/gpt-5-mini",
    "openrouter/google/gemini-2.5-pro"
  ]
};

export class App extends React.Component<AppProps, AppState> {
  private readonly smokeBridge: SmokeBridge;
  private unsubscribeBridge?: () => void;
  private systemThemeQuery?: MediaQueryList;

  constructor(props: AppProps) {
    super(props);
    this.smokeBridge = props.smokeBridge ?? new NoopSmokeBridge();
    this.state = {
      sessions: [
        {
          id: "session-1",
          title: "Claude: Implement ACP Orchestrator",
          model: "claude-sonnet-4.6",
          contextWindow: "200k"
        }
      ],
      chatMessages: [
        {
          id: crypto.randomUUID(),
          author: "system",
          provider: "codex",
          text: "Select a provider and send a message to start a real ACP session.",
          timestamp: new Date().toISOString(),
          status: "complete"
        }
      ],
      chatInput: "",
      selectedModels: {
        codex: "",
        claude: "",
        opencode: ""
      },
      isSending: false,
      selectedProvider: "codex",
      logs: [],
      themePreference: "system",
      themeMode: "light"
    };
  }

  componentDidMount(): void {
    this.unsubscribeBridge = this.smokeBridge.subscribe((event) => {
      this.handleSmokeBridgeEvent(event);
    });

    this.systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    this.systemThemeQuery.addEventListener("change", this.handleSystemThemeChange);

    const storedPreference = readStoredThemePreference();
    const storedMode = resolveThemeMode(storedPreference, this.systemThemeQuery.matches);
    this.applyThemeMode(storedMode);
    this.setState({
      themePreference: storedPreference,
      themeMode: storedMode
    });
  }

  componentWillUnmount(): void {
    this.unsubscribeBridge?.();
    this.systemThemeQuery?.removeEventListener("change", this.handleSystemThemeChange);
  }

  private applyThemeMode(mode: ThemeMode): void {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }

  private readonly handleSystemThemeChange = (): void => {
    if (this.state.themePreference !== "system") {
      return;
    }
    const mode = resolveThemeMode("system", this.systemThemeQuery?.matches ?? false);
    this.applyThemeMode(mode);
    this.setState({
      themeMode: mode
    });
  };

  private readonly setThemePreference = (nextPreference: ThemePreference): void => {
    writeStoredThemePreference(nextPreference);
    const mode = resolveThemeMode(
      nextPreference,
      this.systemThemeQuery?.matches ?? false
    );
    this.applyThemeMode(mode);
    this.setState({
      themePreference: nextPreference,
      themeMode: mode
    });
  };

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

  private readonly handleSmokeBridgeEvent = (event: SmokeBridgeEvent): void => {
    if (event.type === "chatStreamEvent") {
      this.handleChatStreamEvent(event.payload);
      return;
    }

    if (event.type === "smokeEvent") {
      this.appendLog({
        provider: event.payload.provider,
        level: event.payload.level,
        message: event.payload.message,
        timestamp: event.payload.timestamp
      });
      return;
    }

    this.appendLog({
      provider: event.payload.provider,
      level: event.payload.success ? "info" : "error",
      message: event.payload.success
        ? `Run ${event.payload.runId} finished successfully.`
        : `Run ${event.payload.runId} failed: ${event.payload.error ?? "Unknown error."}`,
      timestamp: event.payload.timestamp
    });
  };

  private readonly handleChatStreamEvent = (
    payload: Extract<SmokeBridgeEvent, { type: "chatStreamEvent" }>["payload"]
  ): void => {
    if (payload.kind === "session_ready") {
      this.setState({
        activeSessionId: payload.sessionId
      });
      return;
    }

    if (payload.kind === "agent_chunk") {
      this.setState((previousState) => {
        const existingIndex = previousState.chatMessages.findIndex(
          (message) =>
            message.requestId === payload.requestId && message.author === "assistant"
        );
        if (existingIndex < 0) {
          return {
            chatMessages: [
              ...previousState.chatMessages,
              {
                id: crypto.randomUUID(),
                requestId: payload.requestId,
                author: "assistant",
                provider: payload.provider,
                text: payload.text ?? "",
                timestamp: payload.timestamp,
                status: "streaming"
              }
            ]
          };
        }

        const nextMessages = [...previousState.chatMessages];
        const existing = nextMessages[existingIndex];
        nextMessages[existingIndex] = {
          ...existing,
          text: `${existing.text}${payload.text ?? ""}`,
          status: "streaming",
          timestamp: payload.timestamp
        };
        return {
          chatMessages: nextMessages
        };
      });
      return;
    }

    if (payload.kind === "agent_complete") {
      this.setState((previousState) => ({
        activeRequestId:
          previousState.activeRequestId === payload.requestId
            ? undefined
            : previousState.activeRequestId,
        chatMessages: previousState.chatMessages.map((message) => {
          if (
            message.requestId !== payload.requestId ||
            message.author !== "assistant"
          ) {
            return message;
          }
          return {
            ...message,
            status: "complete",
            timestamp: payload.timestamp,
            text: message.text.length === 0 ? "(No text returned.)" : message.text
          };
        })
      }));
      this.appendLog({
        provider: payload.provider,
        level: "info",
        message: `Request ${payload.requestId.slice(0, 8)} completed (${payload.stopReason ?? "unknown"}).`,
        timestamp: payload.timestamp
      });
      return;
    }

    this.setState((previousState) => {
      const existingIndex = previousState.chatMessages.findIndex(
        (message) =>
          message.requestId === payload.requestId && message.author === "assistant"
      );
      if (existingIndex < 0) {
        return {
          activeRequestId:
            previousState.activeRequestId === payload.requestId
              ? undefined
              : previousState.activeRequestId,
          chatMessages: [
            ...previousState.chatMessages,
            {
              id: crypto.randomUUID(),
              requestId: payload.requestId,
              author: "system",
              provider: payload.provider,
              text: payload.text ?? "Request failed.",
              timestamp: payload.timestamp,
              status: "error"
            }
          ]
        };
      }

      const nextMessages = [...previousState.chatMessages];
      const existing = nextMessages[existingIndex];
      nextMessages[existingIndex] = {
        ...existing,
        status: "error",
        text: payload.text ?? (existing.text || "Request failed."),
        timestamp: payload.timestamp
      };
      return {
        activeRequestId:
          previousState.activeRequestId === payload.requestId
            ? undefined
            : previousState.activeRequestId,
        chatMessages: nextMessages
      };
    });
    this.appendLog({
      provider: payload.provider,
      level: "error",
      message: payload.text ?? "Request failed.",
      timestamp: payload.timestamp
    });
  };

  private readonly handleSendMessage = async (): Promise<void> => {
    if (this.state.activeRequestId || this.state.isSending) {
      return;
    }
    const messageText = this.state.chatInput.trim();
    if (messageText.length === 0) {
      return;
    }
    const selectedProvider = this.state.selectedProvider;
    const selectedModel =
      this.state.selectedModels[selectedProvider].trim() || undefined;

    if (!this.smokeBridge.isAvailable()) {
      const timestamp = new Date().toISOString();
      this.setState((previousState) => ({
        chatMessages: [
          ...previousState.chatMessages,
          {
            id: crypto.randomUUID(),
            author: "system",
            provider: selectedProvider,
            text: "Electrobun bridge is unavailable. Launch the app with the Electrobun runtime.",
            timestamp,
            status: "error"
          }
        ]
      }));
      return;
    }

    const timestamp = new Date().toISOString();
    this.setState((previousState) => ({
      chatInput: "",
      chatMessages: [
        ...previousState.chatMessages,
        {
          id: crypto.randomUUID(),
          author: "user",
          provider: selectedProvider,
          model: selectedModel,
          text: messageText,
          timestamp,
          status: "complete"
        }
      ],
      isSending: true
    }));

    try {
      const result = await this.smokeBridge.sendChatMessage(
        selectedProvider,
        messageText,
        selectedModel
      );
      this.setState((previousState) => {
        const hasStreamingMessage = previousState.chatMessages.some(
          (message) =>
            message.requestId === result.requestId &&
            message.author === "assistant"
        );
        return {
          activeRequestId: result.requestId,
          activeSessionId: result.sessionId,
          isSending: false,
          chatMessages: hasStreamingMessage
            ? previousState.chatMessages
            : [
                ...previousState.chatMessages,
                {
                  id: crypto.randomUUID(),
                  requestId: result.requestId,
                  author: "assistant",
                  provider: result.provider,
                  model: result.model,
                  text: "",
                  timestamp: new Date().toISOString(),
                  status: "streaming"
                }
              ]
        };
      });
      this.appendLog({
        provider: result.provider,
        level: "info",
        message: `Request ${result.requestId.slice(0, 8)} queued for ${result.provider}.`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorText =
        error instanceof Error
          ? error.message
          : "Failed to send message to provider.";
      this.setState((previousState) => ({
        isSending: false,
        chatMessages: [
          ...previousState.chatMessages,
          {
            id: crypto.randomUUID(),
            author: "system",
            provider: selectedProvider,
            text: errorText,
            timestamp: new Date().toISOString(),
            status: "error"
          }
        ]
      }));
    }
  };

  private appendLog(input: Omit<SmokeLogLine, "id">): void {
    const entry: SmokeLogLine = {
      ...input,
      id: crypto.randomUUID()
    };

    this.setState((previousState) => ({
      logs: [...previousState.logs.slice(-149), entry]
    }));
  }

  render(): React.ReactNode {
    const selectedModel =
      this.state.selectedModels[this.state.selectedProvider];
    const modelOptions = PROVIDER_MODELS[this.state.selectedProvider];
    const selectedProviderLabel =
      this.state.selectedProvider === "codex"
        ? "Codex"
        : this.state.selectedProvider === "claude"
          ? "Claude"
          : "OpenCode";

    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Agent Orchestrator</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Electrobun desktop runtime with in-app real agent smoke testing.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Theme</span>
            <select
              aria-label="Theme"
              className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
              onChange={(event) =>
                this.setThemePreference(event.target.value as ThemePreference)
              }
              value={this.state.themePreference}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </header>

        <section className="grid gap-4 lg:grid-cols-[280px_1fr_320px]">
          <SessionListPanel
            onCreateSession={this.handleCreateSession}
            sessions={this.state.sessions}
          />
          <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Chat
              </h2>
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                disabled={Boolean(this.state.activeRequestId)}
                onChange={(event) =>
                  this.setState({
                    selectedProvider: event.target.value as SmokeProvider
                  })
                }
                value={this.state.selectedProvider}
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
                <option value="opencode">OpenCode</option>
              </select>
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                disabled={Boolean(this.state.activeRequestId) || this.state.isSending}
                onChange={(event) =>
                  this.setState((previousState) => ({
                    selectedModels: {
                      ...previousState.selectedModels,
                      [this.state.selectedProvider]: event.target.value
                    }
                  }))
                }
                value={selectedModel}
              >
                <option value="">Default model</option>
                {modelOptions.map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
                  </option>
                ))}
              </select>
            </div>

            <ChatSurface messages={this.state.chatMessages} />

            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Message for {selectedProviderLabel}
            </label>
            <textarea
              className="mb-3 min-h-20 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              disabled={Boolean(this.state.activeRequestId) || this.state.isSending}
              onChange={(event) =>
                this.setState({
                  chatInput: event.target.value
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void this.handleSendMessage();
                }
              }}
              placeholder="Type a prompt and press Enter to send."
              value={this.state.chatInput}
            />

            <PrimaryButton
              disabled={Boolean(this.state.activeRequestId) || this.state.isSending}
              label="Send"
              onClick={() => {
                void this.handleSendMessage();
              }}
            />
          </section>

          <div className="space-y-4">
            <InspectorPanel
              contextWindow={this.state.activeSessionId ? "live session" : "not started"}
              modelName={selectedProviderLabel}
              onRetry={() => {}}
              onStop={() => {}}
            />

            <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Runtime events
              </h2>
              <div className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-2">
                {this.state.logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No runtime events yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {this.state.logs.map((line) => (
                      <li className="text-xs" key={line.id}>
                        <span className="text-muted-foreground">
                          [{new Date(line.timestamp).toLocaleTimeString()}]
                        </span>{" "}
                        <span className="font-medium uppercase text-muted-foreground">
                          {line.provider}
                        </span>{" "}
                        <span
                          className={
                            line.level === "error"
                              ? "text-destructive"
                              : line.level === "info"
                                ? "text-primary"
                                : "text-foreground"
                          }
                        >
                          {line.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>
    );
  }
}
