import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Used by Storybook (via @storybook/react-vite) and Vitest.
export default defineConfig({
  plugins: [react()],
});
