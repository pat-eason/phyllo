import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@phyllo/ui";
import { useToasts } from "./toastContext";

function Pusher() {
  const toasts = useToasts();
  let count = 0;
  return (
    <div style={{ display: "flex", gap: 8, padding: 24 }}>
      <Button
        onClick={() =>
          toasts.push({
            title: `Export finished ${++count}`,
            body: "Untitled Groove.wav · 1:08 · 24-bit",
            action: { label: "Reveal", onClick: () => {} },
          })
        }
      >
        Push a toast
      </Button>
      <Button onClick={() => toasts.push({ title: "Couldn't save the recording", body: "Disk is full.", tone: "error" })}>
        Push an error
      </Button>
      <Button
        onClick={() => {
          for (const n of [1, 2, 3, 4, 5]) toasts.push({ title: `Notification ${n}`, body: "Only three show at once.", duration: 60_000 });
        }}
      >
        Push five
      </Button>
    </div>
  );
}

/** The app-level toast queue (the decorator wraps stories in `<ToastProvider>`): top right, newest on top, three at a time. */
const meta = {
  title: "Shell/Toasts",
  component: Pusher,
} satisfies Meta<typeof Pusher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
