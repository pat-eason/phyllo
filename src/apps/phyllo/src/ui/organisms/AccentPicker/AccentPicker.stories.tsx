import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import type { MockStoresOptions } from "../../../state/mocks";
import { ThemeScope } from "../SettingsLayout/ThemeScope";
import { AccentPicker } from "./AccentPicker";

const withScope: Decorator = (Story) => (
  <ThemeScope>
    <div style={{ maxWidth: 860, padding: 40 }}>
      <Story />
    </div>
  </ThemeScope>
);

const meta = {
  title: "Organisms/AccentPicker",
  component: AccentPicker,
  decorators: [withScope],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AccentPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const appearance = (mode: "dark" | "light" | "system", accent: "green" | "red" | "blue" | "purple" | "orange" | "teal"): { stores: MockStoresOptions } => ({
  stores: { initialSettings: { appearance: { mode, accent } } },
});

export const Dark: Story = { parameters: appearance("dark", "green") };
export const Light: Story = { parameters: appearance("light", "green") };
/** Match system: follows the OS appearance. */
export const MatchSystem: Story = { parameters: appearance("system", "green") };
/** Red: the note about record and mute turning magenta (D28), and the record key in the preview. */
export const Red: Story = { parameters: appearance("dark", "red") };
export const RedLight: Story = { parameters: appearance("light", "red") };
export const Blue: Story = { parameters: appearance("dark", "blue") };
export const Purple: Story = { parameters: appearance("light", "purple") };
export const Orange: Story = { parameters: appearance("dark", "orange") };
export const Teal: Story = { parameters: appearance("light", "teal") };
