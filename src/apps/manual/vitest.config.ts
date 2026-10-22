import { defineConfig } from "vitest/config";

export default defineConfig({
  // capture/*.spec.ts are Playwright specs (`pnpm screenshots`), not unit tests.
  test: { include: ["**/*.test.ts"], exclude: ["**/node_modules/**", "docs/.vitepress/**"] },
});
