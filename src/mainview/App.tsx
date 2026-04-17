import React from "react";
import { InspectorPanel } from "../ui/components/InspectorPanel.tsx";
import {
   SessionListPanel,
   type SessionListItem,
} from "../ui/components/SessionListPanel.tsx";
import { PrimaryButton } from "../ui/components/ui/PrimaryButton.tsx";
import type { ProviderModelCatalog, SmokeProvider } from "../shared/AppRPC.ts";
import type { ChatMessage } from "./chat/types.ts";
import { ChatSurface } from "./components/ChatSurface.tsx";
import { NoopSmokeBridge, type SmokeBridge, type SmokeBridgeEvent } from "./bridge/SmokeBridge.ts";
import {
   createInitialProviderModelCatalogs,
   getProviderModelHelperText,
   getProviderModelOptions,
   getSelectedModelValue,
} from "./providerModelCatalogState.ts";
import {
   readStoredThemePreference,
   resolveThemeMode,
   writeStoredThemePreference,
   type ThemeMode,
   type ThemePreference,
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

interface ChatSession extends SessionListItem {
   provider: SmokeProvider;
}

interface AppState {
   sessions: ChatSession[];
   chatMessages: ChatMessage[];
   chatInput: string;
   draftProvider: SmokeProvider;
   providerModelCatalogs: Record<SmokeProvider, ProviderModelCatalog>;
   selectedModels: Record<SmokeProvider, string>;
   isSending: boolean;
   isCreatingSession: boolean;
   isDraftingSession: boolean;
   activeRequestId?: string;
   activeSessionId?: string;
   selectedProvider: SmokeProvider;
   logs: SmokeLogLine[];
   themePreference: ThemePreference;
   themeMode: ThemeMode;
}

function getProviderLabel(provider: SmokeProvider): string {
   return provider === "codex"
     ? "Codex"
     : provider === "claude"
       ? "Claude"
       : "OpenCode";
}

export class App extends React.Component<AppProps, AppState> {
   private readonly smokeBridge: SmokeBridge;
   private unsubscribeBridge?: () => void;
   private systemThemeQuery?: MediaQueryList;

   constructor(props: AppProps) {
      super(props);
      this.smokeBridge = props.smokeBridge ?? new NoopSmokeBridge();
      this.state = {
         sessions: [],
         chatMessages: [],
         chatInput: "",
         draftProvider: "codex",
         providerModelCatalogs: createInitialProviderModelCatalogs(),
         selectedModels: {
            codex: "",
            claude: "",
            opencode: "",
         },
         isSending: false,
         isCreatingSession: false,
         isDraftingSession: true,
         selectedProvider: "codex",
         logs: [],
         themePreference: "system",
         themeMode: "light",
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
         themeMode: storedMode,
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
         themeMode: mode,
      });
   };

   private readonly setThemePreference = (nextPreference: ThemePreference): void => {
      writeStoredThemePreference(nextPreference);
      const mode = resolveThemeMode(
         nextPreference,
         this.systemThemeQuery?.matches ?? false,
      );
      this.applyThemeMode(mode);
      this.setState({
         themePreference: nextPreference,
         themeMode: mode,
      });
   };

   private upsertSession(
      sessions: readonly ChatSession[],
      session: ChatSession,
   ): ChatSession[] {
      const existingIndex = sessions.findIndex((item) => item.id === session.id);
      if (existingIndex < 0) {
         return [...sessions, session];
      }
      const next = [...sessions];
      next[existingIndex] = {
         ...next[existingIndex],
         ...session,
      };
      return next;
   }

   private createSessionListItem(
      provider: SmokeProvider,
      sessionId: string,
      model?: string,
   ): ChatSession {
      return {
         id: sessionId,
         provider,
         title: `${getProviderLabel(provider)} ${sessionId.slice(0, 8)}`,
         model: model?.trim() || "default",
         contextWindow: "live session",
      };
   }

   private readonly handleSelectSession = (sessionId: string): void => {
      if (this.state.activeRequestId || this.state.isSending || this.state.isCreatingSession) {
         return;
      }
      const selected = this.state.sessions.find((session) => session.id === sessionId);
      if (!selected) {
         return;
      }
      this.setState({
         activeSessionId: selected.id,
         isDraftingSession: false,
         selectedProvider: selected.provider,
      });
      void this.hydrateProviderModelCatalog(selected.provider);
   };

   private readonly handleSelectProvider = (provider: SmokeProvider): void => {
      this.setState({
         draftProvider: provider,
      });
   };

   private readonly hydrateProviderModelCatalog = async (
      provider: SmokeProvider,
   ): Promise<void> => {
      if (!this.smokeBridge.isAvailable()) {
         return;
      }

      try {
         const result = await this.smokeBridge.getProviderModelCatalog(provider);
         this.setState((previousState) => ({
            providerModelCatalogs: {
               ...previousState.providerModelCatalogs,
               [provider]: result.catalog,
            },
            selectedModels: {
               ...previousState.selectedModels,
               [provider]: getSelectedModelValue(
                  previousState.selectedModels[provider],
                  result.catalog,
               ),
            },
         }));
      } catch (error) {
         this.appendLog({
            provider,
            level: "error",
            message:
               error instanceof Error
               ? error.message
               : "Failed to load provider model catalog.",
            timestamp: new Date().toISOString(),
         });
      }
   };

   private readonly handleCreateSession = async (): Promise<void> => {
      if (this.state.activeRequestId || this.state.isSending || this.state.isCreatingSession) {
         return;
      }

      if (!this.state.isDraftingSession) {
         this.setState({
            activeSessionId: undefined,
            chatInput: "",
            draftProvider: this.state.selectedProvider,
            isDraftingSession: true,
         });
         return;
      }

      const provider = this.state.draftProvider;
      if (!this.smokeBridge.isAvailable()) {
         this.appendLog({
            provider,
            level: "error",
            message: "Electrobun bridge is unavailable. Launch the app with the Electrobun runtime.",
            timestamp: new Date().toISOString(),
         });
         return;
      }

      this.setState({
         isCreatingSession: true,
      });

      try {
         const created = await this.smokeBridge.createChatSession(provider);
         this.setState((previousState) => ({
            isCreatingSession: false,
            isDraftingSession: false,
            draftProvider: created.provider,
            selectedProvider: created.provider,
            activeSessionId: created.sessionId,
            sessions: this.upsertSession(
              previousState.sessions,
               this.createSessionListItem(
                  created.provider,
                  created.sessionId,
                  getSelectedModelValue(
                     previousState.selectedModels[created.provider],
                     previousState.providerModelCatalogs[created.provider],
                  ),
               ),
            ),
         }));
         void this.hydrateProviderModelCatalog(created.provider);
         this.appendLog({
            provider: created.provider,
            level: "info",
            message: `Created session ${created.sessionId.slice(0, 8)}.`,
            timestamp: new Date().toISOString(),
         });
      } catch (error) {
         const message =
            error instanceof Error ? error.message : "Failed to create session.";
         this.setState({
            isCreatingSession: false,
            isDraftingSession: true,
         });
         this.appendLog({
            provider,
            level: "error",
            message,
            timestamp: new Date().toISOString(),
         });
      }
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
            timestamp: event.payload.timestamp,
         });
         return;
      }

      this.appendLog({
         provider: event.payload.provider,
         level: event.payload.success ? "info" : "error",
         message: event.payload.success
                  ? `Run ${event.payload.runId} finished successfully.`
                  : `Run ${event.payload.runId} failed: ${event.payload.error ?? "Unknown error."}`,
         timestamp: event.payload.timestamp,
      });
   };

   private readonly handleChatStreamEvent = (
      payload: Extract<SmokeBridgeEvent, { type: "chatStreamEvent" }>["payload"],
   ): void => {
      if (payload.kind === "session_ready") {
         this.setState((previousState) => ({
            activeSessionId: payload.sessionId,
            isDraftingSession: false,
            draftProvider: payload.provider,
            selectedProvider: payload.provider,
            sessions: this.upsertSession(
               previousState.sessions,
               this.createSessionListItem(
                  payload.provider,
                  payload.sessionId,
                  getSelectedModelValue(
                     previousState.selectedModels[payload.provider],
                     previousState.providerModelCatalogs[payload.provider],
                  ),
               ),
            ),
         }));
         return;
      }

      if (payload.kind === "agent_chunk") {
         this.setState((previousState) => {
            const existingIndex = previousState.chatMessages.findIndex(
               (message) =>
                  message.requestId === payload.requestId && message.author === "assistant",
            );
            if (existingIndex < 0) {
               return {
                  chatMessages: [
                     ...previousState.chatMessages,
                     {
                        id: crypto.randomUUID(),
                        requestId: payload.requestId,
                        sessionId: payload.sessionId,
                        author: "assistant",
                        provider: payload.provider,
                        text: payload.text ?? "",
                        timestamp: payload.timestamp,
                        status: "streaming",
                     },
                  ],
               };
            }

            const nextMessages = [...previousState.chatMessages];
            const existing = nextMessages[existingIndex];
            nextMessages[existingIndex] = {
               ...existing,
               text: `${existing.text}${payload.text ?? ""}`,
               status: "streaming",
               timestamp: payload.timestamp,
            };
            return {
               chatMessages: nextMessages,
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
                  text: message.text.length === 0 ? "(No text returned.)" : message.text,
               };
            }),
         }));
         this.appendLog({
            provider: payload.provider,
            level: "info",
            message: `Request ${payload.requestId.slice(0, 8)} completed (${payload.stopReason ??
            "unknown"}).`,
            timestamp: payload.timestamp,
         });
         return;
      }

      this.setState((previousState) => {
         const existingIndex = previousState.chatMessages.findIndex(
            (message) =>
               message.requestId === payload.requestId && message.author === "assistant",
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
                     sessionId: payload.sessionId,
                     author: "system",
                     provider: payload.provider,
                     text: payload.text ?? "Request failed.",
                     timestamp: payload.timestamp,
                     status: "error",
                  },
               ],
            };
         }

         const nextMessages = [...previousState.chatMessages];
         const existing = nextMessages[existingIndex];
         nextMessages[existingIndex] = {
            ...existing,
            status: "error",
            text: payload.text ?? (existing.text || "Request failed."),
            timestamp: payload.timestamp,
         };
         return {
            activeRequestId:
               previousState.activeRequestId === payload.requestId
               ? undefined
               : previousState.activeRequestId,
            chatMessages: nextMessages,
         };
      });
      this.appendLog({
         provider: payload.provider,
         level: "error",
         message: payload.text ?? "Request failed.",
         timestamp: payload.timestamp,
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
      if (this.state.isDraftingSession || !this.state.activeSessionId) {
         return;
      }
      const selectedProvider = this.state.selectedProvider;
      const selectedCatalog = this.state.providerModelCatalogs[selectedProvider];
      const selectedModelValue = getSelectedModelValue(
         this.state.selectedModels[selectedProvider],
         selectedCatalog,
      );
      const selectedModel = selectedModelValue.trim() || undefined;
      const activeSession = this.state.sessions.find(
         (session) =>
            session.id === this.state.activeSessionId &&
            session.provider === selectedProvider,
      );
      const targetSessionId = activeSession?.id;
      const userMessageId = crypto.randomUUID();

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
                  status: "error",
               },
            ],
         }));
         return;
      }

      const timestamp = new Date().toISOString();
      this.setState((previousState) => ({
         chatInput: "",
         chatMessages: [
            ...previousState.chatMessages,
            {
               id: userMessageId,
               sessionId: targetSessionId,
               author: "user",
               provider: selectedProvider,
               model: selectedModelValue || undefined,
               text: messageText,
               timestamp,
               status: "complete",
            },
         ],
         isSending: true,
      }));

      try {
         const result = await this.smokeBridge.sendChatMessage(
            selectedProvider,
            messageText,
            selectedModel,
            targetSessionId,
         );
         this.setState((previousState) => {
            const hasStreamingMessage = previousState.chatMessages.some(
               (message) =>
                  message.requestId === result.requestId &&
                  message.author === "assistant",
            );
            return {
               activeRequestId: result.requestId,
               activeSessionId: result.sessionId,
               isDraftingSession: false,
               draftProvider: result.provider,
               selectedProvider: result.provider,
               isSending: false,
               sessions: this.upsertSession(
                  previousState.sessions,
                  this.createSessionListItem(
                     result.provider,
                     result.sessionId,
                     result.model ??
                        getSelectedModelValue(
                           previousState.selectedModels[result.provider],
                           previousState.providerModelCatalogs[result.provider],
                        ),
                  ),
               ),
               chatMessages: hasStreamingMessage
                  ? previousState.chatMessages.map((message) =>
                      message.id === userMessageId
                        ? {
                            ...message,
                            requestId: result.requestId,
                            sessionId: result.sessionId,
                          }
                        : message,
                    )
                  : [
                      ...previousState.chatMessages.map((message) =>
                        message.id === userMessageId
                          ? {
                              ...message,
                              requestId: result.requestId,
                              sessionId: result.sessionId,
                            }
                          : message,
                      ),
                      {
                         id: crypto.randomUUID(),
                         requestId: result.requestId,
                         sessionId: result.sessionId,
                         author: "assistant",
                         provider: result.provider,
                         model: result.model,
                         text: "",
                         timestamp: new Date().toISOString(),
                         status: "streaming",
                      },
                   ],
            };
         });
         void this.hydrateProviderModelCatalog(result.provider);
         this.appendLog({
            provider: result.provider,
            level: "info",
            message: `Request ${result.requestId.slice(0, 8)} queued for ${result.provider}.`,
            timestamp: new Date().toISOString(),
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
                  status: "error",
               },
            ],
         }));
      }
   };

   private appendLog(input: Omit<SmokeLogLine, "id">): void {
      const entry: SmokeLogLine = {
         ...input,
         id: crypto.randomUUID(),
      };

      this.setState((previousState) => ({
         logs: [...previousState.logs.slice(-149), entry],
      }));
   }

   render(): React.ReactNode {
      const selectedProvider = this.state.selectedProvider;
      const draftProvider = this.state.draftProvider;
      const selectedCatalog =
         this.state.providerModelCatalogs[selectedProvider];
      const selectedModel = getSelectedModelValue(
         this.state.selectedModels[selectedProvider],
         selectedCatalog,
      );
      const modelOptions = getProviderModelOptions(selectedCatalog);
      const modelHelperText = getProviderModelHelperText(selectedCatalog);
      const selectedProviderLabel = getProviderLabel(selectedProvider);
      const draftProviderLabel = getProviderLabel(draftProvider);
      const hasActiveSession =
         Boolean(this.state.activeSessionId) && !this.state.isDraftingSession;
      const visibleMessages = this.state.activeSessionId
         ? this.state.chatMessages.filter(
            (message) => message.sessionId === this.state.activeSessionId,
         )
         : [];

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
                  activeSessionId={hasActiveSession ? this.state.activeSessionId : undefined}
                  isDraftingSession={this.state.isDraftingSession}
                   onCreateSession={this.handleCreateSession}
                  onSelectProvider={this.handleSelectProvider}
                   onSelectSession={this.handleSelectSession}
                  disabled={
                     Boolean(this.state.activeRequestId) ||
                     this.state.isSending ||
                     this.state.isCreatingSession
                   }
                  selectedProvider={draftProvider}
                  sessions={this.state.sessions}
                />
                <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
                   <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                         Chat
                      </h2>
                   </div>

                   {!hasActiveSession ? (
                      <div className="flex h-[26rem] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
                         Create or select a session to start chatting.
                      </div>
                   ) : (
                      <>
                         <ChatSurface messages={visibleMessages} />

                          <label className="mb-2 block text-xs font-medium text-muted-foreground">
                             Message for {selectedProviderLabel}
                          </label>
                          <textarea
                             className="min-h-20 w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
                             disabled={
                                Boolean(this.state.activeRequestId) ||
                                this.state.isSending ||
                                this.state.isCreatingSession
                             }
                             onChange={(event) =>
                                this.setState({
                                   chatInput: event.target.value,
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
                          <div className="mt-3 flex items-end gap-3">
                             <div className="flex-1">
                                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                                   Model
                                </label>
                                <select
                                   aria-label="Model"
                                   className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
                                   disabled={
                                      Boolean(this.state.activeRequestId) ||
                                      this.state.isSending ||
                                      this.state.isCreatingSession
                                   }
                                   onChange={(event) =>
                                      this.setState((previousState) => ({
                                         selectedModels: {
                                            ...previousState.selectedModels,
                                            [selectedProvider]: event.target.value,
                                         },
                                      }))
                                   }
                                   value={selectedModel}
                                >
                                   <option value="">Default model</option>
                                   {modelOptions.map((modelOption) => (
                                      <option key={modelOption.id} value={modelOption.id}>
                                         {modelOption.title ?? modelOption.id}
                                      </option>
                                   ))}
                                </select>
                                {modelHelperText ? (
                                   <p className="mt-2 text-xs text-muted-foreground">
                                      {modelHelperText}
                                   </p>
                                ) : null}
                             </div>

                             <PrimaryButton
                                disabled={
                                   Boolean(this.state.activeRequestId) ||
                                   this.state.isSending ||
                                   this.state.isCreatingSession
                                }
                                label="Send"
                                onClick={() => {
                                   void this.handleSendMessage();
                                }}
                             />
                          </div>
                      </>
                   )}
                </section>

                <div className="space-y-4">
                   <InspectorPanel
                      contextWindow={this.state.activeSessionId ? "live session" : "not started"}
                      modelName={hasActiveSession ? selectedProviderLabel : draftProviderLabel}
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
