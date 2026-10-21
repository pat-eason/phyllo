import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const port = Number(process.env["HARNESS_PORT"] ?? 4319);

// Browser verification of the Strudel runtime (src/runtime) against a Vite-served harness page.
export default defineConfig({
  testDir: "./harness",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
      },
    },
  ],
  webServer: {
    command: "node harness/serve.mjs",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
