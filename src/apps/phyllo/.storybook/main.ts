import type { StorybookConfig } from "@storybook/react-vite";

// App-level Storybook: organisms and screens rendered against mock stores (DECISIONS D107).
const config: StorybookConfig = {
  stories: ["../src/ui/**/*.stories.@(ts|tsx)"],
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
};

export default config;
