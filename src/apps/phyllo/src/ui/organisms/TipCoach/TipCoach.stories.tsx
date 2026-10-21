import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MockStoresOptions } from "../../../state/mocks";
import { CodeDrawer } from "../CodeDrawer";
import { TipCoach } from "./TipCoach";

/** Below the lanes in the center column, above the code drawer (PNG 01). */
function CoachStory() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 880, background: "var(--ph-bg)" }}>
      <div style={{ flex: 1 }} />
      <TipCoach />
      <CodeDrawer />
    </div>
  );
}

const meta = {
  title: "Organisms/TipCoach",
  component: CoachStory,
} satisfies Meta<typeof CoachStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const atStep = (step: number): MockStoresOptions => ({ initialSettings: { tips: { hidden: false, step } } });

export const Step1: Story = { parameters: { stores: atStep(1) } };

/** PNG 01. */
export const Step3: Story = { parameters: { stores: atStep(3) } };

export const Step5: Story = { parameters: { stores: atStep(5) } };

/** TipCoach renders nothing in Pro (the drawer opens by default there). */
export const ProHidden: Story = { parameters: { stores: { initialSettings: { uiMode: "pro", tips: { hidden: false, step: 3 } } } } };
