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
   getProviderModelSelection,
    getProviderModelOptions,
    getSelectedModelValue,
    resolveProviderModelSelection,
} from "./providerModelCatalogState.ts";
import {
   readStoredThemePreference,
    resolveThemeMode,
    writeStoredThemePreference,
    type ThemeMode,
    type ThemePreference,
 } from "./theme/themePreference.ts";
import { ApprovalDialog } from "./components/ApprovalDialog.tsx";
import type {
   AgentTranscriptEventPayload,
   ApprovalEventPayload,
   ApprovalOutcome,
} from "../shared/AppRPC.ts";

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
   isCancellingRequest: boolean;
   isCreatingSession: boolean;
   isDraftingSession: boolean;
   activeRequestId?: string;
   activeSessionId?: string;
   selectedProvider: SmokeProvider;
   logs: SmokeLogLine[];
   transcriptEntries: AgentTranscriptEventPayload[];
   pendingApprovals: Extract<ApprovalEventPayload, { kind: "requested" }>[];
   respondingApprovalId?: string;
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
          isCancellingRequest: false,
          isCreatingSession: false,
          isDraftingSession: false,
          selectedProvider: "codex",
          logs: [],
          transcriptEntries: [],
          pendingApprovals: [],
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

    private getActiveProvider(): SmokeProvider {
       const activeSession = this.state.activeSessionId
          ? this.state.sessions.find((session) => session.id === this.state.activeSessionId)
          : undefined;
       return activeSession?.provider ?? this.state.selectedProvider;
    }

    private getLastUserMessage(sessionId?: string): ChatMessage | undefined {
       if (!sessionId) {
          return undefined;
       }
       for (let index = this.state.chatMessages.length - 1; index >= 0; index -= 1) {
          const message = this.state.chatMessages[index];
          if (message.sessionId === sessionId && message.author === "user") {
             return message;
          }
       }
       return undefined;
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
      const shouldHydrate = this.state.isDraftingSession;
      this.setState({
         draftProvider: provider,
      });
      if (shouldHydrate) {
         void this.hydrateProviderModelCatalog(provider);
      }
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
          const activeSession = this.state.activeSessionId
             ? this.state.sessions.find((session) => session.id === this.state.activeSessionId)
             : undefined;
          const draftProvider = activeSession?.provider ?? this.state.selectedProvider;
          this.setState({
             draftProvider,
             isDraftingSession: true,
          });
         void this.hydrateProviderModelCatalog(draftProvider);
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

       if (event.type === "approvalEvent") {
          this.handleApprovalEvent(event.payload);
          return;
       }

       if (event.type === "agentTranscriptEvent") {
          this.handleAgentTranscriptEvent(event.payload);
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

    private readonly handleApprovalEvent = (
       payload: Extract<SmokeBridgeEvent, { type: "approvalEvent" }>["payload"],
    ): void => {
       if (payload.kind === "requested") {
          this.setState((previousState) => {
             const existingIndex = previousState.pendingApprovals.findIndex(
                (approval) => approval.approvalId === payload.approvalId,
             );
             if (existingIndex < 0) {
                return {
                   pendingApprovals: [...previousState.pendingApprovals, payload],
                };
             }

             const nextApprovals = [...previousState.pendingApprovals];
             nextApprovals[existingIndex] = payload;
             return {
                pendingApprovals: nextApprovals,
             };
          });
          this.appendLog({
             provider: payload.provider,
             level: "update",
             message: `Approval requested for tool call ${payload.toolCallId.slice(0, 8)}.`,
             timestamp: payload.timestamp,
          });
          return;
       }

       this.setState((previousState) => ({
          pendingApprovals: previousState.pendingApprovals.filter(
             (approval) => approval.approvalId !== payload.approvalId,
          ),
          respondingApprovalId:
             previousState.respondingApprovalId === payload.approvalId
             ? undefined
             : previousState.respondingApprovalId,
       }));
       this.appendLog({
          provider: payload.provider,
          level: "info",
          message:
             payload.outcome.outcome === "cancelled"
             ? `Approval ${payload.approvalId} cancelled.`
             : `Approval ${payload.approvalId} answered with ${payload.outcome.optionId}.`,
          timestamp: payload.timestamp,
       });
    };

    private readonly handleAgentTranscriptEvent = (
       payload: Extract<SmokeBridgeEvent, { type: "agentTranscriptEvent" }>["payload"],
    ): void => {
       this.setState((previousState) => ({
          transcriptEntries: [...previousState.transcriptEntries.slice(-199), payload],
       }));
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
             isCancellingRequest: false,
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
                   text:
                      message.text.length === 0
                      ? payload.stopReason === "cancelled"
                        ? "(Cancelled before any text returned.)"
                        : "(No text returned.)"
                      : message.text,
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
                isCancellingRequest: false,
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
             isCancellingRequest: false,
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

    private readonly handleStopActiveRequest = async (): Promise<void> => {
       if (!this.state.activeRequestId || !this.state.activeSessionId || this.state.isCancellingRequest) {
          return;
       }

       const provider = this.getActiveProvider();
       this.setState({
          isCancellingRequest: true,
       });

       try {
          const result = await this.smokeBridge.cancelChatMessage(
             provider,
             this.state.activeSessionId,
             this.state.activeRequestId,
          );
          this.appendLog({
             provider: result.provider,
             level: "info",
             message: `Cancellation requested for ${result.requestId.slice(0, 8)}.`,
             timestamp: result.cancelledAt,
          });
       } catch (error) {
          const message =
             error instanceof Error ? error.message : "Failed to cancel request.";
          this.setState({
             isCancellingRequest: false,
          });
          this.appendLog({
             provider,
             level: "error",
             message,
             timestamp: new Date().toISOString(),
          });
       }
    };

    private readonly handleRespondToApproval = async (
       approvalId: string,
       outcome: ApprovalOutcome,
    ): Promise<void> => {
       const provider = this.getActiveProvider();
       this.setState({
          respondingApprovalId: approvalId,
       });

       try {
          await this.smokeBridge.respondToApproval(provider, approvalId, outcome);
       } catch (error) {
          const message =
             error instanceof Error ? error.message : "Failed to answer approval request.";
          this.setState({
             respondingApprovalId: undefined,
          });
          this.appendLog({
             provider,
             level: "error",
             message,
             timestamp: new Date().toISOString(),
          });
       }
    };

    private readonly handleRetryLastMessage = async (): Promise<void> => {
       if (this.state.isSending || this.state.activeRequestId || this.state.isCreatingSession) {
          return;
       }

       const lastUserMessage = this.getLastUserMessage(this.state.activeSessionId);
       if (!lastUserMessage) {
          return;
       }

       await this.handleSendMessage(lastUserMessage.text);
    };

    private readonly handleSendMessage = async (
       messageOverride?: string,
    ): Promise<void> => {
       if (this.state.activeRequestId || this.state.isSending) {
          return;
       }
       const messageText = (messageOverride ?? this.state.chatInput).trim();
       if (messageText.length === 0) {
          return;
       }
       if (!this.state.activeSessionId) {
          return;
       }
       const activeSession = this.state.sessions.find(
          (session) => session.id === this.state.activeSessionId,
       );
       const selectedProvider = activeSession?.provider ?? this.state.selectedProvider;
       const selectedCatalog = this.state.providerModelCatalogs[selectedProvider];
       const selectedModelValue = getSelectedModelValue(
          this.state.selectedModels[selectedProvider],
          selectedCatalog,
       );
       const selectedModel = selectedModelValue.trim() || undefined;
       const shouldClearInput = messageOverride === undefined;
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
          chatInput: shouldClearInput ? "" : previousState.chatInput,
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
             isCancellingRequest: false,
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
       const activeSession = this.state.activeSessionId
          ? this.state.sessions.find((session) => session.id === this.state.activeSessionId)
          : undefined;
       const activeProvider = activeSession?.provider ?? selectedProvider;
       const selectedCatalog =
          this.state.providerModelCatalogs[activeProvider];
       const selectedModelState = getProviderModelSelection(
          this.state.selectedModels[activeProvider],
          selectedCatalog,
       );
       const modelOptions = getProviderModelOptions(selectedCatalog);
       const modelHelperText = getProviderModelHelperText(selectedCatalog);
        const selectedProviderLabel = getProviderLabel(activeProvider);
        const draftProviderLabel = getProviderLabel(draftProvider);
        const hasActiveSession = Boolean(this.state.activeSessionId);
        const isBusy =
           Boolean(this.state.activeRequestId) ||
           this.state.isSending ||
           this.state.isCreatingSession ||
           this.state.isCancellingRequest;
        const canStopActiveRequest =
           Boolean(this.state.activeRequestId) &&
           Boolean(this.state.activeSessionId) &&
           !this.state.isCancellingRequest;
        const showStopAction = this.state.isSending || Boolean(this.state.activeRequestId);
        const lastUserMessage = this.getLastUserMessage(this.state.activeSessionId);
        const currentApproval = this.state.pendingApprovals[0];
        const visibleTranscriptEntries = this.state.activeSessionId
           ? this.state.transcriptEntries.filter(
               (entry) =>
                  entry.sessionId === this.state.activeSessionId ||
                  (!entry.sessionId && entry.provider === activeProvider),
            )
            : this.state.transcriptEntries.filter((entry) => entry.provider === draftProvider);
        const newestTranscriptEntriesFirst = visibleTranscriptEntries.slice().reverse();
        const newestLogsFirst = this.state.logs.slice().reverse();
        const visibleMessages = this.state.activeSessionId
           ? this.state.chatMessages.filter(
               (message) => message.sessionId === this.state.activeSessionId,
          )
          : [];

       return (
          <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background p-6 text-foreground">
             <header className="mb-6 flex flex-none items-center justify-between gap-4">
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

             <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
                  <SessionListPanel
                    activeSessionId={this.state.activeSessionId}
                    isDraftingSession={this.state.isDraftingSession}
                     onCreateSession={this.handleCreateSession}
                   onSelectProvider={this.handleSelectProvider}
                    onSelectSession={this.handleSelectSession}
                   disabled={isBusy}
                   selectedProvider={draftProvider}
                   sessions={this.state.sessions}
                 />
                 <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                       <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Chat
                      </h2>
                    </div>

                    {!hasActiveSession ? (
                       <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
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
                              disabled={isBusy}
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
                                    disabled={isBusy}
                                     onChange={(event) =>
                                        this.setState((previousState) => ({
                                           selectedModels: {
                                             ...previousState.selectedModels,
                                             [activeProvider]: resolveProviderModelSelection(
                                                event.target.value,
                                                selectedModelState.selectedThinkingLevelValue,
                                                selectedCatalog,
                                             ),
                                          },
                                       }))
                                    }
                                    value={selectedModelState.modelValue}
                                 >
                                    <option value="">Default model</option>
                                    {modelOptions.map((modelOption) => (
                                       <option key={modelOption.id} value={modelOption.id}>
                                          {modelOption.title ?? modelOption.id}
                                       </option>
                                    ))}
                                 </select>
                              </div>
                              {selectedModelState.thinkingLevelOptions.length > 0 ? (
                                 <div className="flex-1">
                                    <label className="mb-2 block text-xs font-medium text-muted-foreground">
                                       Thinking level
                                    </label>
                                    <select
                                     aria-label="Thinking level"
                                     className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
                                        disabled={isBusy}
                                        onChange={(event) =>
                                           this.setState((previousState) => ({
                                              selectedModels: {
                                                ...previousState.selectedModels,
                                                [activeProvider]: resolveProviderModelSelection(
                                                   selectedModelState.modelValue,
                                                   event.target.value,
                                                   selectedCatalog,
                                                ),
                                             },
                                          }))
                                       }
                                       value={selectedModelState.selectedThinkingLevelValue}
                                    >
                                       {selectedModelState.thinkingLevelOptions.map((level) => (
                                          <option key={level.id} value={level.id}>
                                             {level.title}
                                          </option>
                                       ))}
                                    </select>
                                 </div>
                              ) : null}

                               <PrimaryButton
                                  disabled={
                                    this.state.isCreatingSession ||
                                    (showStopAction
                                       ? !canStopActiveRequest
                                       : this.state.chatInput.trim().length === 0)
                                 }
                                 label={
                                    showStopAction
                                    ? this.state.isCancellingRequest
                                      ? "Stopping..."
                                      : "Stop"
                                    : "Send"
                                 }
                                 onClick={() => {
                                    if (showStopAction) {
                                       void this.handleStopActiveRequest();
                                       return;
                                    }
                                    void this.handleSendMessage();
                                  }}
                               />
                           </div>
                           {modelHelperText ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                 {modelHelperText}
                              </p>
                           ) : null}
                       </>
                    )}
                </section>

                 <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                     <InspectorPanel
                        contextWindow={this.state.activeSessionId ? "live session" : "not started"}
                        activeRequestId={this.state.activeRequestId}
                       canRetry={Boolean(lastUserMessage) && !isBusy}
                       canStop={canStopActiveRequest}
                       isStopping={this.state.isCancellingRequest}
                       isWorking={showStopAction}
                       modelName={hasActiveSession ? selectedProviderLabel : draftProviderLabel}
                       onRetry={() => {
                          void this.handleRetryLastMessage();
                       }}
                       onStop={() => {
                          void this.handleStopActiveRequest();
                        }}
                        pendingApprovalCount={this.state.pendingApprovals.length}
                        transcriptEntries={newestTranscriptEntriesFirst}
                     />

                   <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
                      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                         Runtime events
                      </h2>
                      <div className="rounded-md border border-border bg-muted/40 p-2">
                         {newestLogsFirst.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                               No runtime events yet.
                            </p>
                         ) : (
                             <ul className="space-y-1">
                                {newestLogsFirst.map((line) => (
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
             <ApprovalDialog
                approval={currentApproval}
                isResponding={this.state.respondingApprovalId === currentApproval?.approvalId}
                onSelectOption={(optionId) => {
                   if (!currentApproval) {
                      return;
                   }
                   void this.handleRespondToApproval(currentApproval.approvalId, {
                      outcome: "selected",
                      optionId,
                   });
                }}
             />
          </main>
       );
    }
}
