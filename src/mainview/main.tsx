import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { ElectrobunSmokeBridge } from "./bridge/ElectrobunSmokeBridge.ts";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element '#root' was not found.");
}

const scopedWindow = window as Window & { __electrobun?: unknown };
const smokeBridge = scopedWindow.__electrobun
  ? new ElectrobunSmokeBridge()
  : undefined;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App smokeBridge={smokeBridge} />
  </React.StrictMode>
);

