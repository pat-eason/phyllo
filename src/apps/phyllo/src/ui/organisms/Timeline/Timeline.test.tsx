import { createTrack } from "@phyllo/model";
import { SOUND_DRAG_MIME } from "@phyllo/ui";
import type { SoundRef } from "@phyllo/ui";
import { act, createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockStores, MockStoresOptions } from "../../../state/mocks";
import { PINNED_NOW, renderWithStores } from "../../../state/testUtils";
import { Timeline } from "./Timeline";
import type { TimelineProps } from "./Timeline";
import { arrangeProject, largeProject, withTracks } from "./timelineFixtures";
import { BASE_BAR_PX } from "./timelineModel";

let stores: MockStores | undefined;

afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
});

function renderTimeline(props: TimelineProps = {}, options: MockStoresOptions = {}) {
  const result = renderWithStores(<Timeline {...props} />, {
    initialProject: arrangeProject(),
    initialSettings: { uiMode: "pro" },
    ...options,
  });
  stores = result.stores;
  return result;
}

/** Client x (px) of the start of 1-based `bar` (jsdom lays everything out at x = 0). */
const xOf = (bar: number) => (bar - 1) * BASE_BAR_PX;

/** A DataTransfer stand-in carrying a library sound (jsdom has no DataTransfer). */
function soundTransfer(ref: SoundRef) {
  const json = JSON.stringify(ref);
  return { types: [SOUND_DRAG_MIME, "text/plain"], getData: (type: string) => (type === SOUND_DRAG_MIME ? json : ""), dropEffect: "none" };
}

/** HTML5 drag and drop isn't simulated by user-event, so this uses fireEvent. */
function dropSound(target: HTMLElement, ref: SoundRef, shiftKey = false) {
  const dataTransfer = soundTransfer(ref);
  fireEvent.dragOver(target, { dataTransfer });
  const drop = createEvent.drop(target, { dataTransfer });
  // jsdom has no DragEvent, so modifier keys from the init dict are dropped; set ⇧ on the event itself.
  Object.defineProperty(drop, "shiftKey", { value: shiftKey });
  fireEvent(target, drop);
}

const clip = (name: string) => screen.getByRole("button", { name });
const trackRows = () => within(screen.getByRole("list", { name: "Tracks" })).getAllByRole("listitem");

describe("Timeline", () => {
  it("should show a lane per track with its header and named clips", () => {
    // Arrange / Act
    renderTimeline();

    // Assert
    expect(trackRows().map((row) => row.getAttribute("aria-label"))).toEqual(["Kick", "Clap", "Hats", "Bass", "Keys", "Lead", "Vox chop"]);
    expect(clip("Kick, bars 9 to 16, bd*4")).toBeInTheDocument();
    expect(clip("Keys, bars 17 to 20, <Cm7 Fm7 Ab^7 G7>")).toBeInTheDocument();
    expect(screen.getByText("7 tracks · 32 bars")).toBeInTheDocument();
    expect(screen.getByText('s("bd").bank("RolandTR909")')).toBeInTheDocument();
  });

  it("should select a track from its name", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();

    // Act
    await user.click(screen.getByRole("button", { name: "Keys" }));

    // Assert
    expect(screen.getByRole("button", { name: "Keys" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Bass" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("listitem", { name: "Keys" })).toHaveAttribute("data-selected");
  });

  it("should move the selection and focus to the next track with ↓ and the previous with ↑ on a header", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();
    screen.getByRole("button", { name: "Bass" }).focus();

    // Act
    await user.keyboard("{ArrowDown}");
    const afterDown = document.activeElement;
    await user.keyboard("{ArrowUp}{ArrowUp}");

    // Assert
    expect(afterDown).toBe(screen.getByRole("button", { name: "Keys" }));
    expect(screen.getByRole("button", { name: "Hats" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Hats" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Bass" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should stop at the first and last track instead of wrapping", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();
    screen.getByRole("button", { name: "Kick" }).focus();

    // Act
    await user.keyboard("{ArrowUp}");
    const atTop = document.activeElement;
    screen.getByRole("button", { name: "Vox chop" }).focus();
    await user.keyboard("{ArrowDown}");

    // Assert
    expect(atTop).toBe(screen.getByRole("button", { name: "Kick" }));
    expect(screen.getByRole("button", { name: "Vox chop" })).toHaveFocus();
  });

  it("should leave ↑/↓ alone while a track is being renamed", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();
    await user.dblClick(screen.getByRole("button", { name: "Kick" }));
    const input = screen.getByRole("textbox", { name: "Rename track Kick" });

    // Act
    await user.keyboard("{ArrowDown}");

    // Assert
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "Clap" })).toHaveAttribute("aria-pressed", "false");
  });

  describe("with more than 40 tracks", () => {
    const LANE_PX = 57;

    function renderMany(count = 120) {
      const result = renderWithStores(<Timeline data-testid="timeline" />, {
        initialProject: largeProject(count, 8),
        initialSettings: { uiMode: "pro" },
      });
      stores = result.stores;
      return result;
    }

    const scrollTo = (top: number) => {
      const scroller = screen.getByTestId("timeline");
      scroller.scrollTop = top;
      fireEvent.scroll(scroller);
    };

    it("should render only the lanes near the top and keep the full list size for assistive tech", () => {
      // Arrange / Act
      renderMany();

      // Assert
      const rows = trackRows();
      expect(rows.length).toBeLessThan(40);
      expect(rows[0]).toHaveAttribute("aria-label", "Track 1");
      expect(rows[0]).toHaveAttribute("aria-posinset", "1");
      expect(rows[0]).toHaveAttribute("aria-setsize", "120");
      expect(screen.queryByRole("listitem", { name: "Track 120" })).not.toBeInTheDocument();
      expect(screen.getByText("120 tracks · 8 bars")).toBeInTheDocument();
    });

    it("should render the lanes in view after scrolling and drop the ones left behind", async () => {
      // Arrange
      renderMany();

      // Act
      scrollTo(LANE_PX * 80);

      // Assert
      await waitFor(() => expect(screen.getByRole("listitem", { name: "Track 81" })).toBeInTheDocument());
      expect(screen.queryByRole("listitem", { name: "Track 1" })).not.toBeInTheDocument();
    });

    it("should keep the lane that holds focus mounted while scrolled away", async () => {
      // Arrange
      renderMany();
      screen.getByRole("button", { name: "Track 1" }).focus();

      // Act
      scrollTo(LANE_PX * 80);

      // Assert
      await waitFor(() => expect(screen.getByRole("listitem", { name: "Track 81" })).toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Track 1" })).toHaveFocus();
    });

    it("should navigate past the rendered window with ↓ by keeping the target mounted", async () => {
      // Arrange
      const user = userEvent.setup();
      renderMany();
      scrollTo(LANE_PX * 80);
      await waitFor(() => expect(screen.getByRole("listitem", { name: "Track 81" })).toBeInTheDocument());
      screen.getByRole("button", { name: "Track 81" }).focus();

      // Act
      await user.keyboard("{ArrowDown}{ArrowDown}");

      // Assert
      expect(screen.getByRole("button", { name: "Track 83" })).toHaveFocus();
      expect(screen.getByRole("button", { name: "Track 83" })).toHaveAttribute("aria-pressed", "true");
    });

    it("should render every lane at 40 tracks", () => {
      // Arrange / Act
      renderMany(40);

      // Assert
      expect(trackRows()).toHaveLength(40);
    });
  });

  it("should mute a track and mark its clips as muted", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();

    // Act
    await user.click(screen.getByRole("button", { name: "Mute Hats" }));

    // Assert
    expect(screen.getByRole("button", { name: "Mute Hats" })).toHaveAttribute("aria-pressed", "true");
    expect(clip("Hats, bars 1 to 8, hh*8, muted")).toBeInTheDocument();
    expect(clip("Kick, bars 9 to 16, bd*4")).toBeInTheDocument();
  });

  it("should solo only the ⌥-clicked track", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline({}, { initialProject: withTracks(arrangeProject(), { kick: { solo: true }, clap: { solo: true } }) });

    // Act
    await user.keyboard("{Alt>}");
    await user.click(screen.getByRole("button", { name: "Solo Bass" }));
    await user.keyboard("{/Alt}");

    // Assert
    expect(screen.getByRole("button", { name: "Solo Bass" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Solo Kick" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Solo Clap" })).toHaveAttribute("aria-pressed", "false");
    expect(clip("Kick, bars 9 to 16, bd*4, muted")).toBeInTheDocument();
  });

  it("should move a clip by dragging its body, as one undo step", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();
    const kick = clip("Kick, bars 9 to 16, bd*4");

    // Act
    await user.pointer([
      { keys: "[MouseLeft>]", target: kick, coords: { clientX: 100 } },
      { coords: { clientX: 100 + BASE_BAR_PX } },
      { coords: { clientX: 100 + 2 * BASE_BAR_PX + 4 } },
      { keys: "[/MouseLeft]" },
    ]);

    // Assert
    expect(clip("Kick, bars 11 to 18, bd*4")).toBeInTheDocument();
    expect(clip("Kick, bars 21 to 32, bd*4")).toBeInTheDocument();
    act(() => stores?.project.getState().undo());
    expect(clip("Kick, bars 9 to 16, bd*4")).toBeInTheDocument();
  });

  it("should duplicate a clip on ⌥-drag", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();

    // Act
    await user.keyboard("{Alt>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: clip("Kick, bars 9 to 16, bd*4"), coords: { clientX: 200 } },
      { coords: { clientX: 200 - 8 * BASE_BAR_PX } },
      { keys: "[/MouseLeft]" },
    ]);
    await user.keyboard("{/Alt}");

    // Assert
    expect(clip("Kick, bars 1 to 8, bd*4")).toBeInTheDocument();
    expect(clip("Kick, bars 9 to 16, bd*4")).toBeInTheDocument();
  });

  it("should nudge a focused clip with ←/→ and resize it with ⇧→", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline({}, { initialSettings: { uiMode: "guided" } });
    clip("Lead, bars 21 to 32, c4 [eb4 g4] ~ bb4").focus();

    // Act
    await user.keyboard("{ArrowLeft}{ArrowLeft}{Shift>}{ArrowLeft}{/Shift}");

    // Assert
    const moved = clip("Lead, bars 19 to 29, c4 [eb4 g4] ~ bb4");
    expect(moved).toHaveFocus();
  });

  it("should nudge by the snap size", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline({ snap: "4" });
    clip("Lead, bars 21 to 32, c4 [eb4 g4] ~ bb4").focus();

    // Act
    await user.keyboard("{ArrowLeft}");

    // Assert
    expect(clip("Lead, bars 17 to 28, c4 [eb4 g4] ~ bb4")).toBeInTheDocument();
  });

  it("should delete the focused clip with Delete", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();
    clip("Vox chop, bars 17 to 20, vox").focus();

    // Act
    await user.keyboard("{Delete}");

    // Assert
    expect(screen.queryByRole("button", { name: "Vox chop, bars 17 to 20, vox" })).not.toBeInTheDocument();
    expect(clip("Vox chop, bars 29 to 32, vox")).toBeInTheDocument();
  });

  it("should cut a clip at the pointer with the Split tool", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline({ tool: "split" });

    // Act
    await user.pointer({ keys: "[MouseLeft]", target: clip("Keys, bars 1 to 8, <Cm7 Fm7 Ab^7 G7>"), coords: { clientX: xOf(5) + 3 } });

    // Assert
    expect(clip("Keys, bars 1 to 4, <Cm7 Fm7 Ab^7 G7>")).toBeInTheDocument();
    expect(clip("Keys, bars 5 to 8, <Cm7 Fm7 Ab^7 G7>")).toBeInTheDocument();
  });

  it("should draw a new clip on an empty lane with the Draw tool", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline({ tool: "draw" });
    const lane = screen.getByTestId("lane-lead");

    // Act
    await user.pointer([
      { keys: "[MouseLeft>]", target: lane, coords: { clientX: xOf(3) + 4 } },
      { coords: { clientX: xOf(6) + 4 } },
      { keys: "[/MouseLeft]" },
    ]);

    // Assert
    expect(clip("Lead, bars 3 to 6, c4 [eb4 g4] ~ bb4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lead" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should keep the Select tool in Guided mode", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline({ tool: "draw" }, { initialSettings: { uiMode: "guided" } });

    // Act
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByTestId("lane-lead"), coords: { clientX: xOf(3) + 4 } });

    // Assert
    expect(within(screen.getByRole("listitem", { name: "Lead" })).getAllByRole("button", { name: /^Lead, bars/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Lead" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should open the Pattern editor on double-click and Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const onEditPattern = vi.fn();
    renderTimeline({ onEditPattern });

    // Act
    await user.dblClick(clip("Bass, bars 9 to 16, <c2 eb2 g2 bb1>*2"));
    clip("Keys, bars 1 to 8, <Cm7 Fm7 Ab^7 G7>").focus();
    await user.keyboard("{Enter}");

    // Assert
    expect(onEditPattern.mock.calls).toEqual([["bass"], ["keys"]]);
  });

  it("should add a track of the chosen kind from the Add track menu", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();

    // Act
    await user.click(screen.getByRole("button", { name: /Add track/ }));
    await user.click(screen.getByRole("menuitem", { name: /Chords/ }));

    // Assert
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trackRows().at(-1)).toHaveAccessibleName("Chords");
    expect(screen.getByRole("button", { name: "Chords" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should close the Add track menu with Escape and return focus", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();
    const add = screen.getByRole("button", { name: /Add track/ });
    await user.click(add);

    // Act
    await user.keyboard("{ArrowDown}{Escape}");

    // Assert
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(add).toHaveFocus();
    expect(add).toHaveAttribute("aria-expanded", "false");
  });

  it("should replace a lane's sound when a library sound is dropped on it", () => {
    // Arrange
    renderTimeline();

    // Act
    dropSound(screen.getByRole("listitem", { name: "Clap" }), { source: "bank", name: "sd", bank: "RolandTR808" });

    // Assert
    expect(clip("Clap, bars 9 to 16, ~ sd")).toBeInTheDocument();
    expect(screen.getByText('s("sd").bank("RolandTR808")')).toBeInTheDocument();
  });

  it("should add the sound as a new track below when it doesn't fit the lane", () => {
    // Arrange
    renderTimeline();

    // Act
    dropSound(screen.getByRole("listitem", { name: "Kick" }), { source: "synth", name: "square" });

    // Assert
    expect(trackRows()[1]).toHaveAccessibleName("Square synth");
    expect(screen.getByText('s("square")')).toBeInTheDocument();
  });

  it("should create a track when a sound is dropped on the Add-track row", () => {
    // Arrange
    renderTimeline();

    // Act
    dropSound(screen.getByTestId("add-track-row"), { source: "sample", name: "vox2" });

    // Assert
    expect(trackRows().at(-1)).toHaveAccessibleName("vox2");
    expect(clip("vox2, bars 1 to 32, vox2")).toBeInTheDocument();
  });

  it("should layer a drum sound into a drum lane's pattern with ⇧", () => {
    // Arrange
    renderTimeline();

    // Act
    dropSound(screen.getByRole("listitem", { name: "Kick" }), { source: "bank", name: "hh", bank: "RolandTR909" }, true);

    // Assert
    expect(clip("Kick, bars 9 to 16, bd*4, hh*8")).toBeInTheDocument();
  });

  it("should layer a synth onto a melodic track with .stack() when ⇧ is held", () => {
    // Arrange
    renderTimeline();

    // Act
    dropSound(screen.getByRole("listitem", { name: "Bass" }), { source: "synth", name: "square" }, true);
    act(() => stores?.engine.getState().regenerateNow());

    // Assert
    expect(stores?.engine.getState().code).toContain('.stack(note("<c2 eb2 g2 bb1>*2").s("square"))');
    expect(trackRows()).toHaveLength(7);
  });

  it("should seek to the snapped bar when the ruler is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline({ snap: "4" });

    // Act
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByTestId("ruler"), coords: { clientX: xOf(12) } });

    // Assert
    expect(stores?.transport.getState().position.bar).toBe(13);
  });

  it("should move and resize the loop region from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();
    screen.getByRole("button", { name: "Loop region, bars 9 to 16" }).focus();

    // Act
    await user.keyboard("{ArrowRight}{Shift>}{ArrowLeft}{/Shift}");

    // Assert
    expect(screen.getByRole("button", { name: "Loop region, bars 10 to 16" })).toHaveFocus();
    expect(stores?.project.getState().project.loop).toEqual({ enabled: true, startBar: 10, endBar: 16 });
  });

  it("should drag the loop band to move the loop", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();

    // Act
    await user.pointer([
      { keys: "[MouseLeft>]", target: screen.getByTestId("loop-grip"), coords: { clientX: 300 } },
      { coords: { clientX: 300 + 4 * BASE_BAR_PX } },
      { keys: "[/MouseLeft]" },
    ]);

    // Assert
    expect(screen.getByRole("button", { name: "Loop region, bars 13 to 20" })).toBeInTheDocument();
    expect(stores?.transport.getState().position.bar).toBe(1);
  });

  it("should seek when a bar inside the loop band is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();

    // Act
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("button", { name: "Loop region, bars 9 to 16" }), coords: { clientX: xOf(13) + 2 } });

    // Assert
    expect(stores?.transport.getState().position.bar).toBe(13);
    expect(stores?.project.getState().project.loop).toEqual({ enabled: true, startBar: 9, endBar: 16 });
  });

  it("should seek instead of moving the loop when its top strip is clicked without dragging", async () => {
    // Arrange
    const user = userEvent.setup();
    renderTimeline();

    // Act
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByTestId("loop-grip"), coords: { clientX: xOf(11) + 2 } });

    // Assert
    expect(stores?.transport.getState().position.bar).toBe(11);
    expect(stores?.project.getState().project.loop).toEqual({ enabled: true, startBar: 9, endBar: 16 });
  });

  it("should mark the section under the playhead as current", () => {
    // Arrange
    renderTimeline();

    // Act
    act(() => stores?.transport.getState().seek(18));

    // Assert
    expect(screen.getByRole("button", { name: "Break, bars 17 to 20" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Intro, bars 1 to 8" })).not.toHaveAttribute("aria-current");
  });

  it("should show the engine's error on the failing track and a code badge", async () => {
    // Arrange
    const project = arrangeProject();
    const broken = createTrack("code", { id: "fx", name: "FX", existing: project.tracks, rawCode: 's("bd").ERROR()' });

    // Act
    renderTimeline({}, { initialProject: { ...project, tracks: [...project.tracks, broken] } });

    // Assert
    const row = screen.getByRole("listitem", { name: "FX" });
    expect(await within(row).findByRole("img", { name: "Error: ERROR is not defined" })).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "Code track" })).toBeInTheDocument();
  });

  it("should outline the first track's Mute while the tip points at it", () => {
    // Arrange
    renderTimeline({}, { initialSettings: { uiMode: "guided", tips: { hidden: false, step: 2 } } });

    // Act
    act(() => stores?.tips.getState().showMe());

    // Assert
    expect(screen.getByRole("button", { name: "Mute Kick" })).toHaveAttribute("data-tip-target", "track-mute");
    expect(screen.getByRole("button", { name: "Solo Kick" })).toHaveAttribute("data-tip-target", "track-solo");
    expect(screen.getByRole("button", { name: "Mute Kick" })).toHaveAttribute("data-tip-active");
    expect(screen.getByRole("button", { name: "Mute Clap" })).not.toHaveAttribute("data-tip-target");
  });

  it("should not re-render a 16-track, 32-bar timeline while playing", async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_NOW);
    let commits = 0;
    const result = renderWithStores(
      <Profiler id="timeline" onRender={() => (commits += 1)}>
        <Timeline />
      </Profiler>,
      { initialProject: { ...largeProject(16, 32), loop: { enabled: false, startBar: 1, endBar: 8 } } },
    );
    stores = result.stores;
    await act(async () => {
      await stores?.transport.getState().play();
    });
    const playhead = screen.getByTestId("playhead");
    const before = commits;
    const startTransform = playhead.style.transform;

    // Act
    act(() => vi.advanceTimersByTime(20_000));

    // Assert
    expect(stores.transport.getState().playing).toBe(true);
    expect(commits).toBe(before);
    expect(playhead.style.transform).not.toBe(startTransform);
    expect(screen.getByRole("button", { name: "Groove, bars 9 to 16" })).toHaveAttribute("aria-current", "true");
  });
});
