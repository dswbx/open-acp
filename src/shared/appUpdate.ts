export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready_to_restart"
  | "up_to_date"
  | "error";

export type AppUpdateAvailability =
  | {
      supported: true;
      channel: string;
      baseUrl: string;
    }
  | {
      supported: false;
      reason: "dev_channel" | "missing_base_url" | "unavailable";
      detail?: string;
    };

export interface AppUpdateStatusEntry {
  status: AppUpdateStatus;
  sourceStatus?: string;
  message: string;
  timestamp: string;
  progressPercent?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
}

export interface AppUpdateState {
  availability: AppUpdateAvailability;
  currentVersion?: string;
  currentHash?: string;
  targetVersion?: string;
  targetHash?: string;
  status: AppUpdateStatus;
  statusMessage: string;
  progressPercent?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
  errorMessage?: string;
  canCheck: boolean;
  canApply: boolean;
  updateAvailable: boolean;
  updateReady: boolean;
}
