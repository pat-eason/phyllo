import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Identity class names so tests can assert on `styles.foo` / `.foo` without hashing.
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
