import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { getMainviewRoute } from "./app/mainviewRoute.ts";
import { ElectrobunSmokeBridge } from "./bridge/ElectrobunSmokeBridge.ts";
import { ToolCallGalleryApp } from "./features/tool-calls/index.ts";
import {
  hydrateUILayoutStateFromBridge,
  hydrateUILayoutStateFromLocalStorage,
  startUILayoutPersistence,
} from "./state/uiStore.ts";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element '#root' was not found.");
}
const appRootElement = rootElement;

const scopedWindow = window as Window & { __electrobun?: unknown };

async function bootstrap(): Promise<void> {
  const smokeBridge = scopedWindow.__electrobun ? new ElectrobunSmokeBridge() : undefined;

  if (smokeBridge?.isAvailable()) {
    try {
      await hydrateUILayoutStateFromBridge(smokeBridge);
    } catch {
      hydrateUILayoutStateFromLocalStorage();
    }
    startUILayoutPersistence(smokeBridge);
  } else {
    hydrateUILayoutStateFromLocalStorage();
    startUILayoutPersistence();
  }

  const route = getMainviewRoute(window.location);
  const appElement =
    route === "tool-calls" ? <ToolCallGalleryApp /> : <App smokeBridge={smokeBridge} />;

  ReactDOM.createRoot(appRootElement).render(<React.StrictMode>{appElement}</React.StrictMode>);
}

void bootstrap();
