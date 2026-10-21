import type { Decorator, Preview } from "@storybook/react-vite";
import { useMemo } from "react";
import "@phyllo/ui/tokens.css";
import "@phyllo/ui/base.css";
import "@phyllo/ui/fonts";
import { ACCENTS, ThemeProvider, type Accent } from "@phyllo/ui";
import { PhylloProvider } from "../src/state";
import { createMockStores, type MockStoresOptions } from "../src/state/mocks";
import { ToastProvider } from "../src/ui/toasts";

/** Stories may pass `parameters.stores` (MockStoresOptions) to seed the mock stores. */
function MockStores({ options, children }: { options: MockStoresOptions | undefined; children: React.ReactNode }) {
  const stores = useMemo(() => createMockStores(options), [options]);
  return (
    <PhylloProvider stores={stores}>
      <ToastProvider>{children}</ToastProvider>
    </PhylloProvider>
  );
}

const withProviders: Decorator = (Story, context) => {
  const theme = context.globals["theme"] === "light" ? "light" : "dark";
  const accent = ACCENTS.includes(context.globals["accent"] as Accent) ? (context.globals["accent"] as Accent) : "green";
  const options = context.parameters["stores"] as MockStoresOptions | undefined;
  return (
    <ThemeProvider mode={theme} accent={accent}>
      <MockStores options={options}>
        <Story />
      </MockStores>
    </ThemeProvider>
  );
};

const preview: Preview = {
  decorators: [withProviders],
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
    backgrounds: { disabled: true },
  },
};

export default preview;
