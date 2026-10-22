import { defineConfig } from "@playwright/test";
import process from "node:process";

// `pnpm --filter phyllo-manual screenshots` regenerates docs/public/screenshots/ from the live Phyllo frontend.
// PHYLLO_MANUAL_PORT lets it run beside another checkout's dev server.
const port = Number(process.env["PHYLLO_MANUAL_PORT"] ?? 1450);
const baseURL = `http://localhost:${port}`;
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: "./capture",
  // capture/*.test.ts are Vitest checks on the output.
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL,
    viewport,
    // Retina-sharp text; pages show the images at half size.
    deviceScaleFactor: 2,
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium", viewport, deviceScaleFactor: 2 } }],
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    cwd: "../phyllo",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
