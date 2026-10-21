import { createProject, createTrack } from "@phyllo/model";
import { SOUND_DRAG_MIME } from "@phyllo/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTips, useTransport } from "../../../hooks";
import type { MockStoresOptions } from "../../../state/mocks";
import { ViewToolbar } from "../ViewToolbar";
import { Timeline } from "./Timeline";
import { DEFAULT_SNAP } from "./timelineModel";
import type { EditTool, Snap } from "./timelineModel";
import { arrangeProject, withTracks } from "./timelineFixtures";

/** Stand-in for the sibling ViewTabs organism. */
function TabsPlaceholder() {
  const tab = (label: string, current = false) => (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        height: 32,
        padding: "0 12px",
        borderRadius: 8,
        fontWeight: 600,
        background: current ? "var(--ph-raised)" : "transparent",
        color: current ? "var(--ph-text)" : "var(--ph-muted)",
      }}
    >
      {label}
    </span>
  );
  return (
    <nav aria-label="Views" style={{ display: "flex", gap: 2 }}>
      {tab("Arrange", true)}
      {tab("Pattern")}
      {tab("Mixer")}
    </nav>
  );
}

/** The Arrange center column: ViewToolbar over the Timeline, with tool/snap lifted like the screen does. */
function ArrangeColumn({ initialTool = "select", children }: { initialTool?: EditTool; children?: ReactNode }) {
  const [tool, setTool] = useState<EditTool>(initialTool);
  const [snap, setSnap] = useState<Snap>(DEFAULT_SNAP);
  const [edited, setEdited] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--ph-bg)", color: "var(--ph-text)" }}>
      <ViewToolbar tabs={<TabsPlaceholder />} tool={tool} onToolChange={setTool} snap={snap} onSnapChange={setSnap} />
      <Timeline tool={tool} snap={snap} onEditPattern={setEdited} />
      {edited ? (
        <p role="status" style={{ margin: 0, padding: "6px 12px", fontSize: 12, borderTop: "1px solid var(--ph-line)" }}>
          Open Pattern editor for {edited}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function AutoPlay() {
  const { play, seek } = useTransport();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    seek(12.25 + 1);
    void play();
  }, [play, seek]);
  return null;
}

function SeekTo({ bar }: { bar: number }) {
  const { seek } = useTransport();
  useEffect(() => seek(bar), [seek, bar]);
  return null;
}

function ShowTip() {
  const { showMe } = useTips();
  useEffect(() => showMe(), [showMe]);
  return null;
}

/** Fakes a library drag hovering a lane and the Add-track row (Chromium supports constructing DataTransfer). */
function DragOver() {
  useEffect(() => {
    const id = setTimeout(() => {
      const data = new DataTransfer();
      data.setData(SOUND_DRAG_MIME, JSON.stringify({ source: "bank", name: "sd", bank: "RolandTR909" }));
      for (const selector of ['[data-testid="lane-clap"]', '[data-testid="add-track-row"]']) {
        const el = document.querySelector(selector);
        el?.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data }));
      }
    }, 50);
    return () => clearTimeout(id);
  }, []);
  return null;
}

const stores = (options: MockStoresOptions): { stores: MockStoresOptions } => ({ stores: options });
const guided = { uiMode: "guided" as const };
const pro = { uiMode: "pro" as const };

const meta = {
  title: "Organisms/Timeline",
  component: Timeline,
  parameters: stores({ initialProject: arrangeProject(), initialSettings: guided }),
  render: () => <ArrangeColumn />,
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** PNG 01: Guided, Bass selected, loop 9–16, playhead parked at 13.2.1. */
export const Guided: Story = {
  render: () => (
    <ArrangeColumn>
      <SeekTo bar={13.25} />
    </ArrangeColumn>
  ),
};

/** PNG 02: Pro with Select / Draw / Split. */
export const ProWithTools: Story = {
  parameters: stores({ initialProject: arrangeProject(), initialSettings: pro }),
  render: () => (
    <ArrangeColumn>
      <SeekTo bar={13.25} />
    </ArrangeColumn>
  ),
};

/** Pro, Draw tool active: click-drag on an empty lane draws a clip. */
export const ProDrawTool: Story = {
  parameters: stores({ initialProject: arrangeProject(), initialSettings: pro }),
  render: () => <ArrangeColumn initialTool="draw" />,
};

/** Pro, Split tool active: click a clip to cut it at the pointer. */
export const ProSplitTool: Story = {
  parameters: stores({ initialProject: arrangeProject(), initialSettings: pro }),
  render: () => <ArrangeColumn initialTool="split" />,
};

/** Playing inside the loop: the playhead and the current section chip move without React renders. */
export const PlayingWithLoop: Story = {
  render: () => (
    <ArrangeColumn>
      <AutoPlay />
    </ArrangeColumn>
  ),
};

/** Keys selected: row tint, raised header, ringed clips. */
export const SelectedTrack: Story = {
  parameters: stores({ initialProject: arrangeProject({ ui: { selectedTrack: "keys", zoom: 1 } }), initialSettings: guided }),
};

/** Hats muted, Kick + Bass soloed: everything else fades. */
export const MutedAndSoloed: Story = {
  parameters: stores({
    initialProject: withTracks(arrangeProject(), { hats: { mute: true }, kick: { solo: true }, bass: { solo: true } }),
    initialSettings: pro,
  }),
};

/** A new blank project. */
export const EmptyProject: Story = {
  parameters: stores({ initialProject: createProject({ id: "prj_empty", now: "2026-10-21T12:00:00.000Z" }), initialSettings: guided }),
};

/** A library sound dragged over the Clap lane (replace) and the Add-track row (new track). */
export const DragOverState: Story = {
  render: () => (
    <ArrangeColumn>
      <DragOver />
    </ArrangeColumn>
  ),
};

/** A code track whose code fails to evaluate: red dot on its header, code badge, code clip. */
export const ErrorTrack: Story = {
  parameters: stores({
    initialProject: (() => {
      const p = arrangeProject();
      const broken = createTrack("code", {
        id: "fx",
        name: "Code",
        existing: p.tracks,
        rawCode: 's("bd").ERROR(2)',
        clips: [{ id: "fx-c1", startBar: 17, endBar: 32 }],
      });
      return { ...p, tracks: [...p.tracks, broken] };
    })(),
    initialSettings: pro,
  }),
};

/** TipCoach "Show me" on step 2 outlines the first track's Mute. */
export const TipHighlight: Story = {
  parameters: stores({ initialProject: arrangeProject(), initialSettings: { ...guided, tips: { hidden: false, step: 2 } } }),
  render: () => (
    <ArrangeColumn>
      <ShowTip />
    </ArrangeColumn>
  ),
};

/** Zoomed in (200 %): wider bars, the timeline scrolls sideways under the sticky headers. */
export const Zoomed: Story = {
  parameters: stores({ initialProject: arrangeProject({ ui: { selectedTrack: "bass", zoom: 2 } }), initialSettings: pro }),
};

/** Light theme, Pro (PNG 02). */
export const LightPro: Story = {
  globals: { theme: "light", accent: "green" },
  parameters: stores({ initialProject: arrangeProject(), initialSettings: pro }),
  render: () => (
    <ArrangeColumn>
      <SeekTo bar={13.25} />
    </ArrangeColumn>
  ),
};
