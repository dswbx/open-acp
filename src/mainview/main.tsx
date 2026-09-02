import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { getMainviewRoute } from "./app/mainviewRoute.ts";
import {
  hydrateRouteFromLocation,
  navigateTo,
  startRoutePopStateListener,
  useRouteStore,
} from "./app/routeStore.ts";
import { ElectrobunSmokeBridge } from "./bridge/ElectrobunSmokeBridge.ts";
import { SettingsScreen } from "./features/settings/index.ts";
import { ToolCallGalleryApp } from "./features/tool-calls/index.ts";
import {
  hydrateAppSettingsFromBridge,
  hydrateAppSettingsFromLocalStorage,
  startAppSettingsPersistence,
  useAppSettingsStore,
} from "./state/appSettingsStore.ts";
import { useSessionStore } from "./state/sessionStore.ts";
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

    try {
      await hydrateAppSettingsFromBridge(smokeBridge);
    } catch {
      hydrateAppSettingsFromLocalStorage();
    }
    startAppSettingsPersistence(smokeBridge);
  } else {
    hydrateUILayoutStateFromLocalStorage();
    startUILayoutPersistence();
    hydrateAppSettingsFromLocalStorage();
    startAppSettingsPersistence();
  }

  const defaultProvider = useAppSettingsStore.getState().settings.general.defaultProvider;
  useSessionStore.setState({
    selectedProvider: defaultProvider,
    draftProvider: defaultProvider,
  });

  hydrateRouteFromLocation(window.location);
  startRoutePopStateListener();
  startSettingsShortcutListener();

  const initialRoute = getMainviewRoute(window.location);
  if (initialRoute === "tool-calls") {
    ReactDOM.createRoot(appRootElement).render(
      <React.StrictMode>
        <ToolCallGalleryApp />
      </React.StrictMode>,
    );
    return;
  }

  ReactDOM.createRoot(appRootElement).render(
    <React.StrictMode>
      <RootView smokeBridge={smokeBridge} />
    </React.StrictMode>,
  );
}

function startSettingsShortcutListener(): void {
  window.addEventListener("keydown", (event) => {
    if (event.key !== "," || !(event.metaKey || event.ctrlKey)) return;
    if (event.altKey || event.shiftKey) return;
    if (useRouteStore.getState().route === "settings") return;
    event.preventDefault();
    navigateTo("settings");
  });
}

function RootView({ smokeBridge }: { smokeBridge?: ElectrobunSmokeBridge }) {
  const route = useRouteStore((state) => state.route);
  if (route === "settings") {
    return <SettingsScreen smokeBridge={smokeBridge} />;
  }
  return <App smokeBridge={smokeBridge} />;
}

void bootstrap();
