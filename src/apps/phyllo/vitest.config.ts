import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Strudel packages (pulled in by @phyllo/engine) expect bundler resolution ("module" field); let Vite
  // transform them instead of Node, which picks "main" and breaks on @kabelsalat/web (same as engine's config).
  resolve: { mainFields: ["module", "jsnext:main", "jsnext", "main"] },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    server: { deps: { inline: [/@strudel\//, /@kabelsalat\//, /superdough/, /supradough/] } },
  },
});
