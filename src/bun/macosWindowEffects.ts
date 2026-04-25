import { existsSync } from "node:fs";
import { join } from "node:path";
import { dlopen, FFIType, type Pointer } from "bun:ffi";
import type { BrowserWindow } from "electrobun/bun";

import { logger } from "../shared/logger.ts";

type MacEffectsWindow = Pick<BrowserWindow, "ptr">;

function loadMacOSWindowEffectsLib() {
  const dylibPath = join(import.meta.dir, "libMacWindowEffects.dylib");

  if (!existsSync(dylibPath)) {
    logger.warn("Native macOS effects lib not found; vibrancy disabled", { dylibPath });
    return undefined;
  }

  return dlopen(dylibPath, {
    enableWindowVibrancy: {
      args: [FFIType.ptr],
      returns: FFIType.bool,
    },
    refreshWindowVibrancy: {
      args: [FFIType.ptr],
      returns: FFIType.bool,
    },
    setSidebarVibrancyWidth: {
      args: [FFIType.ptr, FFIType.f64],
      returns: FFIType.bool,
    },
    setNativeWindowDragRegion: {
      args: [FFIType.ptr, FFIType.f64, FFIType.f64, FFIType.f64, FFIType.f64],
      returns: FFIType.bool,
    },
    ensureWindowShadow: {
      args: [FFIType.ptr],
      returns: FFIType.bool,
    },
  });
}

const macOSWindowEffectsLib =
  process.platform === "darwin" ? loadMacOSWindowEffectsLib() : undefined;

export function applyMacOSWindowEffects(mainWindow: MacEffectsWindow): void {
  if (process.platform !== "darwin") {
    return;
  }

  if (!macOSWindowEffectsLib) {
    return;
  }

  try {
    const windowPtr = mainWindow.ptr as Pointer;
    const vibrancyEnabled = macOSWindowEffectsLib.symbols.enableWindowVibrancy(windowPtr);
    const shadowEnabled = macOSWindowEffectsLib.symbols.ensureWindowShadow(windowPtr);

    logger.info("Applied native macOS window effects", {
      vibrancyEnabled,
      shadowEnabled,
    });
  } catch (error) {
    logger.warn("Failed to apply native macOS window effects", { error });
  }
}

export function refreshMacOSWindowEffects(mainWindow: MacEffectsWindow): void {
  if (process.platform !== "darwin" || !macOSWindowEffectsLib) {
    return;
  }

  try {
    const refreshed = macOSWindowEffectsLib.symbols.refreshWindowVibrancy(
      mainWindow.ptr as Pointer,
    );
    if (!refreshed) {
      logger.debug("Native macOS window effects refresh skipped");
    }
  } catch (error) {
    logger.warn("Failed to refresh native macOS window effects", { error });
  }
}

export function setMacOSNativeDragStrip(mainWindow: MacEffectsWindow, leftOffset: number): void {
  if (process.platform !== "darwin" || !macOSWindowEffectsLib) {
    return;
  }

  try {
    const updated = macOSWindowEffectsLib.symbols.setNativeWindowDragRegion(
      mainWindow.ptr as Pointer,
      leftOffset,
      0,
      0,
      10,
    );
    if (!updated) {
      logger.debug("Native macOS drag strip update skipped", { leftOffset });
    }
  } catch (error) {
    logger.warn("Failed to update native macOS drag strip", { error, leftOffset });
  }
}

export function setMacOSSidebarVibrancyWidth(mainWindow: MacEffectsWindow, width: number): void {
  if (process.platform !== "darwin" || !macOSWindowEffectsLib) {
    return;
  }

  try {
    const updated = macOSWindowEffectsLib.symbols.setSidebarVibrancyWidth(
      mainWindow.ptr as Pointer,
      width,
    );
    if (!updated) {
      logger.debug("Native macOS sidebar vibrancy width update skipped", { width });
    }
  } catch (error) {
    logger.warn("Failed to update native macOS sidebar vibrancy width", { error, width });
  }
}
