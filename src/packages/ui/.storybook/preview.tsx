import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/tokens.css";
import "../src/base.css";
import "../src/fonts";
import { ACCENTS, ThemeProvider, type Accent } from "../src/theme";

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals["theme"] === "light" ? "light" : "dark";
  const accent = ACCENTS.includes(context.globals["accent"] as Accent) ? (context.globals["accent"] as Accent) : "green";
  return (
    <ThemeProvider mode={theme} accent={accent}>
      <Story />
    </ThemeProvider>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  initialGlobals: { theme: "dark", accent: "green" },
  globalTypes: {
    theme: {
      description: "Phyllo theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "dark", title: "Dark", icon: "moon" },
          { value: "light", title: "Light", icon: "sun" },
        ],
      },
    },
    accent: {
      description: "Phyllo accent color",
      toolbar: {
        title: "Accent",
        icon: "paintbrush",
        dynamicTitle: true,
        items: ACCENTS.map((value) => ({ value, title: value[0]!.toUpperCase() + value.slice(1) })),
      },
    },
  },
  parameters: {
    layout: "fullscreen",
    // The token background (from base.css) is the canvas; the stock backgrounds addon would paint over it.
    backgrounds: { disabled: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },
};

export default preview;
