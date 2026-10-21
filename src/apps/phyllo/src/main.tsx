import "@phyllo/ui/tokens.css";
import "@phyllo/ui/base.css";
import "@phyllo/ui/fonts";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { native } from "./native";
import { SETTINGS_HASH } from "./native/browser";
import { PhylloProvider, createAppStores } from "./state";
import { AppThemeProvider } from "./ui/shell";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const desktop = isTauri();
// Desktop: the Settings window has its own label. Browser: Settings opens as a `#/settings` popup (window.opener set).
const settingsOnly = desktop
  ? getCurrentWindow().label !== "main"
  : window.location.hash === SETTINGS_HASH && window.opener !== null;

const stores = createAppStores({ native });

// Write a pending autosave and settings before the window goes away (best effort; autosave runs every 1.5 s anyway).
window.addEventListener("beforeunload", () => void stores.flush());
window.addEventListener("pagehide", () => void stores.flush());

async function openUrl(url: string) {
  if (desktop) {
    const { openUrl: openExternal } = await import("@tauri-apps/plugin-opener");
    await openExternal(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

createRoot(root).render(
  <StrictMode>
    <PhylloProvider stores={stores}>
      <AppThemeProvider>
        <App settingsOnly={settingsOnly} openUrl={(url) => void openUrl(url).catch((e: unknown) => console.warn("[phyllo] open URL", e))} />
      </AppThemeProvider>
    </PhylloProvider>
  </StrictMode>,
);
