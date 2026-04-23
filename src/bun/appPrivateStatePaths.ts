import os from "node:os";
import path from "node:path";

function resolveAppDataRoot(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support");
    case "win32":
      return process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    default:
      return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  }
}

const APP_PRIVATE_STATE_ROOT = path.join(resolveAppDataRoot(), "open-acp");

export function getAppPrivateStateRoot(): string {
  return APP_PRIVATE_STATE_ROOT;
}

export function getWindowStatePath(): string {
  return path.join(APP_PRIVATE_STATE_ROOT, "window-state.json");
}

export function getUILayoutStatePath(): string {
  return path.join(APP_PRIVATE_STATE_ROOT, "layout-state.json");
}
