// Dev server for the engine harness: Vite (through vitest's re-export, no extra dependency) rooted here.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createViteServer } from "vitest/node";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env["HARNESS_PORT"] ?? 4319);

const server = await createViteServer({
  configFile: false,
  root: here,
  logLevel: "warn",
  clearScreen: false,
  // Strudel's core logger and nanostores read process.env.NODE_ENV (REPORT (c)); the app needs the same define.
  define: { "process.env.NODE_ENV": JSON.stringify("development") },
  server: { port, strictPort: true, host: "127.0.0.1" },
  optimizeDeps: {
    entries: [path.join(here, "index.html")],
    include: [
      "@strudel/core",
      "@strudel/mini",
      "@strudel/tonal",
      "@strudel/transpiler",
      "@strudel/webaudio",
      "@strudel/soundfonts",
      "acorn",
    ],
  },
});
await server.listen();
process.stdout.write(`engine harness on http://127.0.0.1:${port}\n`);
