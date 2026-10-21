import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ViewTabs } from "./ViewTabs";
import type { ViewName } from "./ViewTabs";

const meta = {
  title: "Organisms/ViewTabs",
  component: ViewTabs,
  args: { current: "arrange", onNavigate: () => {} },
  decorators: [
    (Story) => (
      <div style={{ padding: 24, minHeight: "100vh", background: "var(--ph-chrome)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ViewTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({ withLibrary }: { withLibrary: boolean }) {
  const [current, setCurrent] = useState<ViewName>(withLibrary ? "library" : "arrange");
  return <ViewTabs current={current} withLibrary={withLibrary} onNavigate={setCurrent} />;
}

export const Views: Story = { render: () => <Interactive withLibrary={false} /> };

export const WithLibrary: Story = { render: () => <Interactive withLibrary /> };

export const Mixer: Story = { args: { current: "mixer" } };
