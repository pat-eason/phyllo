import { defineConfig } from "@playwright/test";
import process from "node:process";

// PHYLLO_E2E_PORT lets parallel checkouts run their own dev server (Tauri's dev port 1420 is the default).
const port = Number(process.env["PHYLLO_E2E_PORT"] ?? 1420);
const baseURL = `http://localhost:${port}`;
// `pnpm e2e:visual` sets PHYLLO_E2E_VISUAL: only the @visual screenshot specs run; plain `pnpm e2e` skips them.
const visual = Boolean(process.env["PHYLLO_E2E_VISUAL"]);
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  ...(visual ? { grep: /@visual/ } : { grepInvert: /@visual/ }),
  timeout: visual ? 120_000 : 45_000,
  use: {
    baseURL,
    viewport,
    trace: "on-first-retry",
    // Strudel plays from a keydown in some flows; headless Chromium would otherwise keep the AudioContext suspended.
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  // The host's own user agent (not the Windows "Desktop Chrome" one) so ⌘/Ctrl detection matches `ControlOrMeta`.
  projects: [{ name: "chromium", use: { browserName: "chromium", viewport } }],
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
