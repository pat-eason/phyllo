import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CodeScope } from "@phyllo/model";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { userEvent, within } from "storybook/test";
import { useEngine, useTransport } from "../../../hooks";
import type { MockStoresOptions } from "../../../state/mocks";
import { fixtureProject } from "../../../state/mocks";
import { CodeDrawer } from "./CodeDrawer";
import { BROKEN_COLUMN, fakeEngineWithErrorColumn, projectWithBrokenTrack } from "./fixtures";

/** Moves the playhead / scope once, like a user would before looking at the drawer. */
function Setup({ bar, scope, children }: { bar?: number; scope?: CodeScope; children: ReactNode }) {
  const { seek } = useTransport();
  const { setScope } = useEngine();
  useEffect(() => {
    if (bar !== undefined) seek(bar);
    if (scope) setScope(scope);
    // Run once on mount: the story's starting state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

/** The center column: the drawer is pinned at its bottom (Arrange screen). */
function CenterColumn({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 880, background: "var(--ph-bg)" }}>
      <div style={{ flex: 1 }} />
      {children}
    </div>
  );
}

interface StoryArgs {
  bar?: number;
  scope?: CodeScope;
}

function DrawerStory({ bar, scope }: StoryArgs) {
  return (
    <Setup bar={bar} scope={scope}>
      <CenterColumn>
        <CodeDrawer />
      </CenterColumn>
    </Setup>
  );
}

const meta = {
  title: "Organisms/CodeDrawer",
  component: DrawerStory,
} satisfies Meta<typeof DrawerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const pro = (extra: MockStoresOptions = {}): MockStoresOptions => ({ initialSettings: { uiMode: "pro" }, ...extra });
const bassSelected = fixtureProject({ ui: { selectedTrack: "bass", zoom: 1 } });

/** PNG 01: one line and "Show code". */
export const GuidedCollapsed: Story = {};

/** Guided, after the user pressed Show code (the choice overrides the mode default). */
export const GuidedExpandedByUser: Story = {
  parameters: { stores: { initialSettings: { codeDrawer: { open: true } } } satisfies MockStoresOptions },
};

/** Pro default: open on "This section" (the loop start's section while stopped). */
export const ProDefault: Story = {
  parameters: { stores: pro() },
};

/** Whole song with `arrange()` wrappers. */
export const ProSongScope: Story = {
  args: { scope: "song" },
  parameters: { stores: pro() },
};

/** "This section · Groove" with the playhead at bar 13. */
export const ProSectionScope: Story = {
  args: { bar: 13, scope: "section" },
  parameters: { stores: pro() },
};

/** PNG 02: Bass selected, its lines highlighted. */
export const SelectedTrackHighlight: Story = {
  args: { bar: 13, scope: "section" },
  parameters: { stores: pro({ initialProject: bassSelected }) },
};

/** A muted track's block is `_$:` and dimmed. */
export const MutedTrack: Story = {
  parameters: {
    stores: pro({
      initialProject: fixtureProject({
        tracks: fixtureProject().tracks.map((t) => (t.id === "hats" ? { ...t, mute: true } : t)),
      }),
    }),
  },
};

/** §4.4: the engine rejects a Code track; message and caret under the line, red gutter marker. */
export const ErrorWithCaret: Story = {
  args: { bar: 13, scope: "section" },
  parameters: {
    stores: pro({ initialProject: projectWithBrokenTrack(), engine: fakeEngineWithErrorColumn(BROKEN_COLUMN) }),
  },
};

/** Guided collapsed with an error: the message shows under the header. */
export const GuidedCollapsedWithError: Story = {
  parameters: { stores: { initialProject: projectWithBrokenTrack() } satisfies MockStoresOptions },
};

/** The Bass pattern opened for editing, with a draft that doesn't parse (the last valid pattern keeps playing). */
export const EditingPatternField: Story = {
  args: { bar: 13, scope: "section" },
  parameters: { stores: pro({ initialProject: bassSelected }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("radio", { name: "This section · Groove", checked: true });
    const [literal] = await canvas.findAllByRole("button", { name: /^Edit pattern for Bass/ });
    if (!literal) return;
    await userEvent.click(literal);
    const input = await canvas.findByRole("textbox", { name: "Pattern for Bass" });
    await userEvent.clear(input);
    await userEvent.type(input, "<a1 c2 [[g1");
  },
};

/** Pro "Edit code" after applying code with a syntax error: line/column shown, model unchanged. */
export const EditCodeWithParseError: Story = {
  parameters: { stores: pro() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Edit code" }));
    const editor = await canvas.findByRole("textbox", { name: "Strudel code for the whole song" });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'setcpm(124/4){Enter}{Enter}$: s("bd*4").bank("RolandTR909"{Enter}$: note("c2 eb2").s("sawtooth")');
    await userEvent.click(canvas.getByRole("button", { name: "Apply" }));
  },
};
