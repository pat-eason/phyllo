import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig } from "vite";

const host = process.env["TAURI_DEV_HOST"];

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // Strudel reads process.env.NODE_ENV (nanostores, core logger); see DECISIONS V1 / T1.5.
  define: { "process.env.NODE_ENV": JSON.stringify(mode) },
  optimizeDeps: {
    include: [
      "@strudel/core",
      "@strudel/mini",
      "@strudel/transpiler",
      "@strudel/tonal",
      "@strudel/webaudio",
    ],
  },

  build: {
    // The Strudel engine alone is ~820 kB minified (the app chunk is ~780 kB); both load from disk inside the Tauri
    // web view, so size costs no download time. 900 keeps the warning for anything that grows past today's chunks.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Strudel (@strudel/*, superdough, @kabelsalat/* and their deps) changes far less often than the app, so it
        // gets its own chunk instead of one ~1.4 MB entry.
        codeSplitting: {
          groups: [
            {
              name: "strudel",
              test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:@strudel|superdough|@kabelsalat)[\\/]/,
            },
          ],
        },
      },
      onLog(level, log, defaultHandler) {
        // Known-benign: @strudel/soundfonts evals the soundfont JSON it loads (third-party code), and
        // @tauri-apps/plugin-opener is imported lazily in main.tsx but statically by native/tauri.ts (it ships in the
        // one chunk either way).
        if (log.code === "EVAL" && log.id?.includes("@strudel/soundfonts")) return;
        if (log.code === "INEFFECTIVE_DYNAMIC_IMPORT" && log.message.includes("@tauri-apps/plugin-opener")) return;
        defaultHandler(level, log);
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
