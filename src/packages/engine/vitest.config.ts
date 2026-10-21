import { defineConfig } from "vitest/config";

export default defineConfig({
  // Strudel packages expect bundler resolution (package.json "module" field); let Vite transform them
  // instead of handing them to Node, which picks "main" and breaks on @kabelsalat/web.
  resolve: { mainFields: ["module", "jsnext:main", "jsnext", "main"] },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: { deps: { inline: [/@strudel\//, /@kabelsalat\//, /superdough/, /supradough/] } },
  },
});
