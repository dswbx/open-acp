import type { AppUpdateState, AppUpdateStatus, AppUpdateStatusEntry } from "../shared/appUpdate.ts";

type UpdaterLocalInfoApi = {
  version(): Promise<string>;
  hash(): Promise<string>;
  channel(): Promise<string>;
  baseUrl(): Promise<string>;
};

type UpdaterCheckResult = {
  version: string;
  hash: string;
  updateAvailable: boolean;
  updateReady: boolean;
  error: string;
};

type UpdaterStatusDetails = {
  currentHash?: string;
  latestHash?: string;
  progress?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  errorMessage?: string;
};

type UpdaterStatusRecord = {
  status: string;
  message: string;
  timestamp: number;
  details?: UpdaterStatusDetails;
};

export type ElectrobunUpdaterLike = {
  localInfo: UpdaterLocalInfoApi;
  onStatusChange(callback: ((entry: UpdaterStatusRecord) => void) | null): void;
  checkForUpdate(): Promise<UpdaterCheckResult>;
  downloadUpdate(): Promise<void>;
  applyUpdate(): Promise<void>;
};

export interface AppUpdaterManager {
  initialize(): Promise<void>;
  getState(): AppUpdateState;
  subscribe(listener: (entry: AppUpdateStatusEntry, state: AppUpdateState) => void): () => void;
  checkForUpdates(): Promise<AppUpdateState>;
  applyUpdate(): Promise<AppUpdateState>;
  dispose(): void;
}

interface CreateAppUpdaterManagerOptions {
  updater: ElectrobunUpdaterLike;
  now?: () => string;
}

type LocalUpdaterInfo = {
  version: string;
  hash: string;
  channel: string;
  baseUrl: string;
};

const DEFAULT_IDLE_MESSAGE = "Check for updates";

function createUnsupportedState(
  reason: "dev_channel" | "missing_base_url" | "unavailable",
  detail?: string,
): AppUpdateState {
  return {
    availability: {
      supported: false,
      reason,
      detail,
    },
    status: "idle",
    statusMessage: DEFAULT_IDLE_MESSAGE,
    canCheck: false,
    canApply: false,
    updateAvailable: false,
    updateReady: false,
  };
}

function createSupportedState(info: LocalUpdaterInfo): AppUpdateState {
  return {
    availability: {
      supported: true,
      channel: info.channel,
      baseUrl: info.baseUrl,
    },
    currentVersion: info.version,
    currentHash: info.hash,
    status: "idle",
    statusMessage: DEFAULT_IDLE_MESSAGE,
    canCheck: true,
    canApply: false,
    updateAvailable: false,
    updateReady: false,
  };
}

function mapUpdaterStatus(status: string): AppUpdateStatus {
  switch (status) {
    case "checking":
    case "check-complete":
      return "checking";
    case "update-available":
      return "available";
    case "download-starting":
    case "checking-local-tar":
    case "local-tar-found":
    case "local-tar-missing":
    case "fetching-patch":
    case "patch-found":
    case "patch-not-found":
    case "downloading-patch":
    case "applying-patch":
    case "patch-applied":
    case "extracting-version":
    case "patch-chain-complete":
    case "downloading-full-bundle":
    case "download-progress":
    case "decompressing":
      return "downloading";
    case "download-complete":
      return "ready_to_restart";
    case "no-update":
      return "up_to_date";
    case "error":
    case "patch-failed":
      return "error";
    default:
      return "idle";
  }
}

export function createAppUpdaterManager(
  options: CreateAppUpdaterManagerOptions,
): AppUpdaterManager {
  const now = options.now ?? (() => new Date().toISOString());
  const listeners = new Set<(entry: AppUpdateStatusEntry, state: AppUpdateState) => void>();
  let state = createUnsupportedState("unavailable");
  let initializePromise: Promise<void> | undefined;
  let activeDownload: Promise<void> | undefined;
  let activeCheck: Promise<void> | undefined;

  function emit(entry: AppUpdateStatusEntry): void {
    state = mergeStateFromEntry(state, entry);
    for (const listener of listeners) {
      listener(entry, state);
    }
  }

  function setState(next: AppUpdateState): void {
    state = next;
  }

  function normalizeStatusEntry(entry: UpdaterStatusRecord): AppUpdateStatusEntry {
    return {
      status: mapUpdaterStatus(entry.status),
      sourceStatus: entry.status,
      message: entry.message,
      timestamp: new Date(entry.timestamp).toISOString(),
      progressPercent: entry.details?.progress,
      bytesDownloaded: entry.details?.bytesDownloaded,
      totalBytes: entry.details?.totalBytes,
    };
  }

  async function loadLocalInfo(): Promise<LocalUpdaterInfo | undefined> {
    try {
      const [version, hash, channel, baseUrl] = await Promise.all([
        options.updater.localInfo.version(),
        options.updater.localInfo.hash(),
        options.updater.localInfo.channel(),
        options.updater.localInfo.baseUrl(),
      ]);
      return {
        version,
        hash,
        channel,
        baseUrl: baseUrl.trim(),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setState(createUnsupportedState("unavailable", detail));
      return undefined;
    }
  }

  function refreshStateFromLocalInfo(nextLocalInfo: LocalUpdaterInfo): void {
    if (nextLocalInfo.channel === "dev") {
      setState(createUnsupportedState("dev_channel"));
      return;
    }
    if (nextLocalInfo.baseUrl.length === 0) {
      setState(createUnsupportedState("missing_base_url"));
      return;
    }
    setState(createSupportedState(nextLocalInfo));
  }

  async function ensureInitialized(): Promise<void> {
    if (!initializePromise) {
      initializePromise = (async () => {
        options.updater.onStatusChange((entry) => {
          emit(normalizeStatusEntry(entry));
        });

        const nextLocalInfo = await loadLocalInfo();
        if (!nextLocalInfo) {
          return;
        }

        refreshStateFromLocalInfo(nextLocalInfo);
        if (state.canCheck) {
          void checkForUpdatesInternal(true);
        }
      })();
    }
    await initializePromise;
  }

  async function downloadUpdateInternal(): Promise<void> {
    if (activeDownload) {
      return activeDownload;
    }

    activeDownload = (async () => {
      try {
        await options.updater.downloadUpdate();
        if (state.status !== "error" && !state.updateReady) {
          emit({
            status: "ready_to_restart",
            message: "Restart to install the downloaded update",
            timestamp: now(),
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to download update.";
        emit({
          status: "error",
          message,
          timestamp: now(),
        });
      } finally {
        activeDownload = undefined;
      }
    })();

    return activeDownload;
  }

  async function checkForUpdatesInternal(autoDownload: boolean): Promise<void> {
    if (activeCheck) {
      return activeCheck;
    }

    activeCheck = (async () => {
      if (!state.canCheck) {
        return;
      }

      emit({
        status: "checking",
        message: "Checking for updates...",
        timestamp: now(),
      });

      try {
        const result = await options.updater.checkForUpdate();
        const checkedAt = now();

        state = {
          ...state,
          targetVersion: result.version || state.targetVersion,
          targetHash: result.hash || state.targetHash,
          lastCheckedAt: checkedAt,
          lastUpdatedAt: checkedAt,
        };

        if (result.error) {
          emit({
            status: "error",
            message: result.error,
            timestamp: checkedAt,
          });
          return;
        }

        if (result.updateReady) {
          emit({
            status: "ready_to_restart",
            message: "Restart to install the downloaded update",
            timestamp: checkedAt,
          });
          return;
        }

        if (result.updateAvailable) {
          emit({
            status: "available",
            message: `Update ${result.version} is available`,
            timestamp: checkedAt,
          });
          if (autoDownload) {
            await downloadUpdateInternal();
          }
          return;
        }

        emit({
          status: "up_to_date",
          message: "You’re up to date",
          timestamp: checkedAt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to check for updates.";
        emit({
          status: "error",
          message,
          timestamp: now(),
        });
      } finally {
        activeCheck = undefined;
      }
    })();

    return activeCheck;
  }

  return {
    async initialize() {
      await ensureInitialized();
    },
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async checkForUpdates() {
      await ensureInitialized();
      await checkForUpdatesInternal(true);
      return state;
    },
    async applyUpdate() {
      await ensureInitialized();
      if (!state.canApply) {
        return state;
      }

      emit({
        status: "ready_to_restart",
        message: "Restarting to install update...",
        timestamp: now(),
      });

      try {
        await options.updater.applyUpdate();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to apply update.";
        emit({
          status: "error",
          message,
          timestamp: now(),
        });
      }

      return state;
    },
    dispose() {
      options.updater.onStatusChange(null);
      listeners.clear();
    },
  };
}

function mergeStateFromEntry(current: AppUpdateState, entry: AppUpdateStatusEntry): AppUpdateState {
  const next: AppUpdateState = {
    ...current,
    status: entry.status,
    statusMessage: entry.message,
    progressPercent: entry.progressPercent,
    bytesDownloaded: entry.bytesDownloaded,
    totalBytes: entry.totalBytes,
    lastUpdatedAt: entry.timestamp,
    errorMessage: entry.status === "error" ? entry.message : undefined,
  };

  switch (entry.status) {
    case "checking":
      next.canCheck = false;
      next.canApply = false;
      break;
    case "available":
      next.updateAvailable = true;
      next.updateReady = false;
      next.canCheck = true;
      next.canApply = false;
      break;
    case "downloading":
      next.updateAvailable = true;
      next.updateReady = false;
      next.canCheck = false;
      next.canApply = false;
      break;
    case "ready_to_restart":
      next.updateAvailable = true;
      next.updateReady = true;
      next.canCheck = true;
      next.canApply = true;
      break;
    case "up_to_date":
      next.updateAvailable = false;
      next.updateReady = false;
      next.canCheck = true;
      next.canApply = false;
      break;
    case "error":
      next.canCheck = current.availability.supported;
      next.canApply = current.updateReady;
      break;
    case "idle":
      next.canCheck = current.availability.supported;
      next.canApply = false;
      next.updateAvailable = false;
      next.updateReady = false;
      break;
  }

  return next;
}
