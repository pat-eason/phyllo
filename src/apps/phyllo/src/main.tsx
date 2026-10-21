import "@phyllo/ui/tokens.css";
import "@phyllo/ui/base.css";
import "@phyllo/ui/fonts";
import { isTauri } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { native } from "./native";
import { runSelftestIfEnabled } from "./selftest";
import { PhylloProvider, createAppStores } from "./state";
import { AppThemeProvider } from "./ui/shell";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const desktop = isTauri();
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
        <App openUrl={(url) => void openUrl(url).catch((e: unknown) => console.warn("[phyllo] open URL", e))} />
      </AppThemeProvider>
    </PhylloProvider>
  </StrictMode>,
);

// In-app self-test (T7.5a): runs only when launched with PHYLLO_SELFTEST=1 (scripts/selftest.sh), then quits.
if (desktop) {
  void runSelftestIfEnabled(stores).catch((e: unknown) => console.warn("[phyllo] self-test", e));
}
