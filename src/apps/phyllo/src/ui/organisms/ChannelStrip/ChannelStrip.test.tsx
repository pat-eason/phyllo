import { findTrack } from "@phyllo/model";
import type { Project } from "@phyllo/model";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEngine } from "../../../state/fakeEngine";
import type { FakeEngine } from "../../../state/fakeEngine";
import type { MockStores } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { ChannelStrip } from "./ChannelStrip";
import { mixerProject } from "./fixtures";

const projectOf = (stores: MockStores): Project => stores.project.getState().project;
const trackOf = (stores: MockStores, id: string) => findTrack(projectOf(stores), id);
const renderStrip = (ui: ReactElement, engine?: FakeEngine) =>
  renderWithStores(ui, { initialProject: mixerProject(), ...(engine ? { engine } : {}) });

/** A ready engine whose capture tap delivers one stereo chunk. */
function capturingEngine(): FakeEngine {
  const engine = createFakeEngine({ ready: true });
  engine.startCapture = (onChunk) => {
    onChunk([new Float32Array([0.1, 0.2]), new Float32Array([0.3, 0.4])], 48000);
    return () => {};
  };
  return engine;
}

describe("ChannelStrip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should summarise a track's inserts, sends and bus", () => {
    // Arrange
    renderStrip(<ChannelStrip kind="track" trackId="bass" />);
    const strip = screen.getByRole("region", { name: "Bass channel" });

    // Assert
    const inserts = within(strip).getByRole("list", { name: "Inserts" });
    expect(within(inserts).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["lpf~sine", "lpq10", "shape.3"]);
    expect(within(strip).getByText("sawtooth")).toBeInTheDocument();
    expect(within(strip).getByRole("slider", { name: "Bass Space" })).toHaveAttribute("aria-valuetext", "Space .2");
    expect(within(strip).getByRole("combobox", { name: "Bass bus" })).toHaveValue("2");
  });

  it("should write the fader to .gain() and show the new dB value", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="kick" />);
    const fader = screen.getByRole("slider", { name: "Kick volume" });
    expect(fader).toHaveAttribute("aria-valuetext", "−1.7 dB");

    // Act
    fader.focus();
    await user.keyboard("{ArrowUp}");

    // Assert
    expect(trackOf(stores, "kick")?.params.gain).toBe(0.871);
    expect(screen.getByText("−1.2 dB")).toBeInTheDocument();
  });

  it("should disable the fader with a note when the gain is patterned", () => {
    // Arrange
    renderStrip(<ChannelStrip kind="track" trackId="hats" />);

    // Assert
    expect(screen.getByRole("slider", { name: "Hats volume" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("pattern")).toBeInTheDocument();
    expect(screen.getByText(/Volume follows a pattern/)).toBeInTheDocument();
  });

  it("should toggle mute and solo and follow changes made elsewhere", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="clap" />);

    // Act
    await user.click(screen.getByRole("button", { name: "Mute Clap" }));
    await user.click(screen.getByRole("button", { name: "Solo Clap" }));

    // Assert
    expect(trackOf(stores, "clap")).toMatchObject({ mute: true, solo: true });
    act(() => stores.project.getState().dispatch({ type: "track/setMute", trackId: "clap", mute: false }));
    expect(screen.getByRole("button", { name: "Mute Clap" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should select the track when its header is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="kick" />);
    const header = screen.getByRole("button", { name: /^Kick/ });
    expect(header).toHaveAttribute("aria-pressed", "false");

    // Act
    await user.click(header);

    // Assert
    expect(projectOf(stores).ui.selectedTrack).toBe("kick");
    expect(header).toHaveAttribute("aria-pressed", "true");
  });

  it("should write the Space send to .room()", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="kick" />);

    // Act
    screen.getByRole("slider", { name: "Kick Space" }).focus();
    await user.keyboard("{ArrowUp}");

    // Assert
    expect(trackOf(stores, "kick")?.params.room).toBe(0.01);
  });

  it("should move the track to another bus or a new one", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="bass" />);
    const bus = screen.getByRole("combobox", { name: "Bass bus" });

    // Act + Assert
    await user.selectOptions(bus, "orbit 5");
    expect(trackOf(stores, "bass")?.orbit).toBe(5);
    await user.selectOptions(bus, "New bus (orbit 2)");
    expect(trackOf(stores, "bass")?.orbit).toBe(2);
  });

  it("should add a param from + Effect and return focus to the trigger", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="kick" />);
    const trigger = screen.getByRole("button", { name: "Add effect to Kick" });

    // Act
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Effects for Kick" });
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus();
    await user.click(within(menu).getByRole("menuitem", { name: /\.hpf\(300\)/ }));

    // Assert
    expect(trackOf(stores, "kick")?.params.hpf).toBe(300);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("should add an effect modifier from + Effect and list it as an insert", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="kick" />);

    // Act
    await user.click(screen.getByRole("button", { name: "Add effect to Kick" }));
    await user.click(screen.getByRole("menuitem", { name: /\.crush\(6\)/ }));

    // Assert
    expect(trackOf(stores, "kick")?.modifiers.map((m) => m.code)).toEqual([".crush(6)"]);
    const inserts = within(screen.getByRole("list", { name: "Inserts" })).getAllByRole("listitem");
    expect(inserts.map((li) => li.textContent)).toEqual(["shape.15", "crush6"]);
  });

  it("should close the + Effect menu on Escape without changing the track", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="kick" />);
    const before = trackOf(stores, "kick");
    const trigger = screen.getByRole("button", { name: "Add effect to Kick" });

    // Act
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Escape}");

    // Assert
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trackOf(stores, "kick")).toBe(before);
  });

  it("should edit an insert value inline and revert on Escape", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="kick" />);

    // Act
    await user.click(screen.getByRole("button", { name: "shape .15, edit" }));
    const field = screen.getByRole("textbox", { name: "Kick shape value" });
    await user.clear(field);
    await user.type(field, ".4{Enter}");
    await user.click(screen.getByRole("button", { name: "shape .4, edit" }));
    await user.type(screen.getByRole("textbox", { name: "Kick shape value" }), "9{Escape}");

    // Assert
    expect(trackOf(stores, "kick")?.params.shape).toBe(0.4);
    expect(screen.getByRole("button", { name: "shape .4, edit" })).toBeInTheDocument();
  });

  it("should ignore an insert value that isn't a number", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="track" trackId="kick" />);

    // Act
    await user.click(screen.getByRole("button", { name: "shape .15, edit" }));
    const field = screen.getByRole("textbox", { name: "Kick shape value" });
    await user.clear(field);
    await user.type(field, "loud{Enter}");

    // Assert
    expect(trackOf(stores, "kick")?.params.shape).toBe(0.15);
  });

  it("should show a bus's shared settings and write them with bus/set", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="bus" orbit={1} />);
    const strip = screen.getByRole("region", { name: "Bus 1 channel" });
    expect(within(strip).getByText("Shared by 3 tracks")).toBeInTheDocument();
    expect(within(strip).getByText(/share one reverb and delay; changing the room size affects all of them/)).toBeInTheDocument();
    expect(within(strip).getByText("master")).toBeInTheDocument();

    // Act
    within(strip).getByRole("slider", { name: "Bus 1 roomsize" }).focus();
    await user.keyboard("{ArrowUp}");

    // Assert
    expect(projectOf(stores).buses.find((b) => b.orbit === 1)?.roomsize).toBe(2.1);
  });

  it("should mute every track on the bus from the bus M button", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="bus" orbit={1} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Mute bus 1 (all 3 tracks)" }));

    // Assert
    expect(projectOf(stores).tracks.map((t) => [t.id, t.mute])).toEqual([
      ["kick", true],
      ["clap", true],
      ["hats", true],
      ["bass", false],
    ]);
    expect(screen.getByRole("button", { name: "Mute bus 1 (all 3 tracks)" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should toggle the master limiter in the model and the engine", async () => {
    // Arrange
    const user = userEvent.setup();
    const engine = createFakeEngine({ ready: true });
    const setLimiter = vi.spyOn(engine, "setLimiter");
    const { stores } = renderStrip(<ChannelStrip kind="master" />, engine);
    expect(setLimiter).toHaveBeenLastCalledWith(true);

    // Act
    await user.click(screen.getByRole("switch", { name: "Limiter" }));

    // Assert
    expect(projectOf(stores).master.limiter).toBe(false);
    expect(setLimiter).toHaveBeenLastCalledWith(false);
  });

  it("should write the master fader to postgain", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="master" />);
    const fader = screen.getByRole("slider", { name: "Master volume" });
    expect(fader).toHaveAttribute("aria-valuetext", "−0.9 dB");

    // Act
    fader.focus();
    await user.keyboard("{Home}");

    // Assert
    expect(projectOf(stores).master.postgain).toBe(1.995);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("should list the engine's output devices and save the choice in settings", async () => {
    // Arrange
    const user = userEvent.setup();
    const engine = createFakeEngine({ ready: true });
    vi.spyOn(engine, "listOutputDevices").mockResolvedValue([
      { id: "default", label: "System default" },
      { id: "dev-2", label: "Studio Monitors" },
    ]);
    const { stores } = renderStrip(<ChannelStrip kind="master" />, engine);

    // Act
    await user.selectOptions(screen.getByRole("combobox", { name: "Output device" }), await screen.findByRole("option", { name: "Studio Monitors" }));

    // Assert
    expect(stores.settings.getState().settings.audio.outputDevice).toBe("dev-2");
  });

  it("should record the master output to a 24-bit WAV take and offer Reveal", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="master" />, capturingEngine());
    const begin = vi.spyOn(stores.native, "exportBegin").mockResolvedValue({ sessionId: "s1" });
    const chunk = vi.spyOn(stores.native, "exportChunk").mockResolvedValue();
    vi.spyOn(stores.native, "exportFinish").mockResolvedValue({
      path: "/Users/me/Music/Phyllo/Exports/Untitled Groove take 1.wav",
      durationSec: 12,
      peakDbfs: -3,
      bytes: 100,
    });
    const reveal = vi.spyOn(stores.native, "revealInFinder").mockResolvedValue();

    // Act
    await user.click(screen.getByRole("button", { name: "Record master output to a file" }));
    await user.click(await screen.findByRole("button", { name: "Stop recording the master output" }));

    // Assert
    expect(begin).toHaveBeenCalledWith(
      expect.objectContaining({ format: "wav", bitDepth: 24, channels: 2, path: expect.stringMatching(/^Untitled Groove take \d+\.wav$/) }),
    );
    expect(chunk).toHaveBeenCalledWith("s1", new Float32Array([0.1, 0.3, 0.2, 0.4]));
    expect(await screen.findByText("Saved Untitled Groove take 1.wav")).toBeInTheDocument();
    expect(screen.getByText("0:12 · 24-bit WAV")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(reveal).toHaveBeenCalledWith("/Users/me/Music/Phyllo/Exports/Untitled Groove take 1.wav");
    expect(screen.getByRole("button", { name: "Record master output to a file" })).toBeInTheDocument();
  });

  it("should show an error toast when the recording can't be written", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderStrip(<ChannelStrip kind="master" />, capturingEngine());
    vi.spyOn(stores.native, "exportBegin").mockResolvedValue({ sessionId: "s1" });
    vi.spyOn(stores.native, "exportChunk").mockRejectedValue(new Error("disk full"));
    const cancel = vi.spyOn(stores.native, "exportCancel").mockResolvedValue();

    // Act
    await user.click(screen.getByRole("button", { name: "Record master output to a file" }));
    await user.click(await screen.findByRole("button", { name: "Stop recording the master output" }));

    // Assert
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save the recording");
    expect(alert).toHaveTextContent("disk full");
    expect(cancel).toHaveBeenCalledWith("s1");
  });
});
