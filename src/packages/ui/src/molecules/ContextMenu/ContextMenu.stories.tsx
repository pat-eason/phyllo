import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { MouseEvent } from "react";
import { ContextMenu } from "./ContextMenu";
import { MENU_SEPARATOR } from "./menuModel";
import type { MenuEntry } from "./menuModel";

const COLORS = [
  ["Green", "#7FD98A"],
  ["Teal", "#5ECFC8"],
  ["Blue", "#8AB4FF"],
  ["Amber", "#F5C25B"],
] as const;

function trackEntries(log: (what: string) => void, muted: boolean): MenuEntry[] {
  return [
    { id: "rename", label: "Rename", accelerator: "F2", onSelect: () => log("rename") },
    { id: "edit", label: "Edit pattern", accelerator: "Enter", onSelect: () => log("edit") },
    MENU_SEPARATOR,
    { id: "mute", label: "Mute", accelerator: "M", checked: muted, onSelect: () => log("mute") },
    { id: "solo", label: "Solo", accelerator: "S", checked: false, onSelect: () => log("solo") },
    MENU_SEPARATOR,
    {
      type: "submenu",
      id: "color",
      label: "Colour",
      items: COLORS.map(([name, hex]) => ({ id: hex, label: name, swatch: hex, checked: hex === "#8AB4FF", onSelect: () => log(name) })),
    },
    { id: "paste", label: "Paste", disabled: true, title: "Nothing copied yet", onSelect: () => log("paste") },
    MENU_SEPARATOR,
    { id: "duplicate", label: "Duplicate", accelerator: "CmdOrCtrl+D", onSelect: () => log("duplicate") },
    { id: "delete", label: "Delete track", accelerator: "Delete", destructive: true, onSelect: () => log("delete") },
  ];
}

/** Right-click the panel (or focus it and press Shift+F10) to open the menu where the pointer is. */
function Playground() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [last, setLast] = useState("nothing yet");
  const [muted, setMuted] = useState(false);

  function log(what: string) {
    setLast(what);
    if (what === "mute") setMuted((value) => !value);
  }

  function openAt(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setAt({ x: event.clientX, y: event.clientY });
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Track Bass"
        onContextMenu={openAt}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            setAt({ x: rect.left + 24, y: rect.top + 24 });
          }
        }}
        style={{
          display: "grid",
          placeItems: "center",
          width: 360,
          height: 160,
          borderRadius: 12,
          border: "1px dashed var(--ph-line)",
          color: "var(--ph-muted)",
          font: "var(--ph-text-body)",
        }}
      >
        Right-click me
      </div>
      <p style={{ font: "var(--ph-text-small)", color: "var(--ph-muted)" }}>Last chosen: {last}</p>
      {at ? <ContextMenu x={at.x} y={at.y} label="Track Bass" entries={trackEntries(log, muted)} onClose={() => setAt(null)} /> : null}
    </div>
  );
}

const meta = {
  title: "Molecules/ContextMenu",
  component: ContextMenu,
  args: { x: 24, y: 24, label: "Track Bass", entries: trackEntries(() => undefined, false), onClose: () => undefined },
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opened at a fixed point; Right on Colour opens the submenu. */
export const Open: Story = {};

export const RightClick: Story = { render: () => <Playground /> };
