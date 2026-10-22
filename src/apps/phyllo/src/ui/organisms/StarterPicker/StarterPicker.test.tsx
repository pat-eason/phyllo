import { toShareUrl } from "@phyllo/engine";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockNative, createMockStores, fixtureProject, seedLibrary } from "../../../state/mocks";
import type { MockStores } from "../../../state/mocks";
import { PINNED_NOW, renderWithStores } from "../../../state/testUtils";
import { StarterPicker } from "./StarterPicker";
import type { StarterPickerProps } from "./StarterPicker";
import { SHORT_LINK_MESSAGE } from "./ImportLink";

const DAY_MS = 86_400_000;
const atOffset = (days: number, hours = 0): string => new Date(PINNED_NOW.getTime() - days * DAY_MS - hours * 3_600_000).toISOString();

function renderPicker(props: Partial<StarterPickerProps> = {}, stores: MockStores = createMockStores()) {
  const onOpened = vi.fn();
  const result = renderWithStores(<StarterPicker onOpened={onOpened} now={() => PINNED_NOW.getTime()} {...props} />, { stores });
  return { ...result, onOpened, user: userEvent.setup() };
}

const codeListing = () => screen.getByRole("textbox", { name: "The code it writes" });

describe("StarterPicker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render the multi-line code preview without React errors", () => {
    // Arrange
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    renderPicker();

    // Assert
    expect(codeListing().textContent?.split("\n").length).toBeGreaterThan(2);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("should mark step 1 as the current step", () => {
    // Arrange / Act
    renderPicker();

    // Assert
    const steps = within(screen.getByRole("list", { name: "Setup steps" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(["1Start", "2Tempo & key", "3Sounds", "4Play"]);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("aria-current");
  });

  it("should list the code the House starter writes, at its own tempo", () => {
    // Arrange / Act
    renderPicker();

    // Assert
    expect(screen.getByRole("button", { name: /House groove/ })).toHaveAttribute("aria-pressed", "true");
    expect(codeListing()).toHaveTextContent('setcpm(124/4)');
    expect(codeListing()).toHaveTextContent('$: s("bd*4").bank("RolandTR909")');
    expect(screen.getByRole("textbox", { name: "Tempo in BPM" })).toHaveValue("124");
  });

  it("should switch the code and reset the tempo and key when another starter is picked", async () => {
    // Arrange
    const { user } = renderPicker();
    await user.click(screen.getByRole("button", { name: /^House groove/ }));
    await user.click(screen.getByRole("button", { name: "Faster" }));

    // Act
    await user.click(screen.getByRole("button", { name: /Lo-fi keys/ }));

    // Assert
    expect(screen.getByRole("button", { name: /Lo-fi keys/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /House groove/ })).toHaveAttribute("aria-pressed", "false");
    expect(codeListing()).toHaveTextContent("setcpm(82/4)");
    expect(codeListing()).toHaveTextContent('chord("<F^7 Em7 Dm7 C^7>")');
    expect(screen.getByRole("textbox", { name: "Tempo in BPM" })).toHaveValue("82");
    expect(screen.getByRole("combobox", { name: "Key" })).toHaveValue("F major");
  });

  it("should nudge the tempo by one BPM and update setcpm live", async () => {
    // Arrange
    const { user } = renderPicker();

    // Act
    await user.click(screen.getByRole("button", { name: "Faster" }));
    await user.click(screen.getByRole("button", { name: "Faster" }));
    await user.click(screen.getByRole("button", { name: "Slower" }));

    // Assert
    expect(screen.getByRole("textbox", { name: "Tempo in BPM" })).toHaveValue("125");
    expect(codeListing()).toHaveTextContent("setcpm(125/4)");
  });

  it("should clamp a typed tempo to 40-240 when committed with Enter", async () => {
    // Arrange
    const { user } = renderPicker();
    const field = screen.getByRole("textbox", { name: "Tempo in BPM" });

    // Act
    await user.clear(field);
    await user.type(field, "999{Enter}");

    // Assert
    expect(field).toHaveValue("240");
    expect(codeListing()).toHaveTextContent("setcpm(240/4)");
    expect(screen.getByRole("button", { name: "Faster" })).toBeDisabled();
  });

  it("should set the tempo from the average of the last four taps", async () => {
    // Arrange
    vi.useFakeTimers({ toFake: ["Date"] });
    const { user } = renderPicker();
    const tap = screen.getByRole("button", { name: "Tap tempo" });

    // Act: five taps 500 ms apart
    for (let i = 0; i < 5; i += 1) {
      vi.setSystemTime(PINNED_NOW.getTime() + i * 500);
      await user.click(tap);
    }

    // Assert
    expect(screen.getByRole("textbox", { name: "Tempo in BPM" })).toHaveValue("120");
  });

  it("should transpose the melodic tracks when the key changes and leave drums alone", async () => {
    // Arrange
    const { user } = renderPicker();

    // Act
    await user.selectOptions(screen.getByRole("combobox", { name: "Key" }), "F minor");

    // Assert
    expect(codeListing()).toHaveTextContent('note("<f1 f1 ab1 eb1>*2")');
    expect(codeListing()).toHaveTextContent('s("bd*4").bank("RolandTR909")');
  });

  it("should offer every root in minor, major and dorian", () => {
    // Arrange / Act
    renderPicker();

    // Assert
    const options = within(screen.getByRole("combobox", { name: "Key" })).getAllByRole("option");
    expect(options).toHaveLength(36);
    expect(options.map((option) => option.textContent)).toContain("Eb dorian");
  });

  it("should create the project from the pick, switch to Guided and report it opened on Continue", async () => {
    // Arrange
    const stores = createMockStores({ initialSettings: { uiMode: "pro" } });
    const { user, onOpened } = renderPicker({}, stores);
    await user.click(screen.getByRole("button", { name: /Breakbeat/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Key" }), "G minor");

    // Act
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Assert
    const { project, dirty } = stores.project.getState();
    expect(project.tempo.bpm).toBe(170);
    expect(project.key).toBe("G minor");
    expect(project.tracks).toHaveLength(3);
    expect(dirty).toBe(true);
    expect(stores.settings.getState().settings.uiMode).toBe("guided");
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("should create the starter straight away on double-click", async () => {
    // Arrange
    const stores = createMockStores();
    const { user, onOpened } = renderPicker({}, stores);

    // Act
    await user.dblClick(screen.getByRole("button", { name: /Euclid rhythms/ }));

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(110);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("should open a blank project in Pro mode when skipping to Pro", async () => {
    // Arrange
    const stores = createMockStores();
    const { user, onOpened } = renderPicker({}, stores);

    // Act
    await user.click(screen.getByRole("button", { name: "I know Strudel — skip to Pro" }));

    // Assert
    expect(stores.project.getState().project.tracks).toHaveLength(0);
    expect(stores.settings.getState().settings.uiMode).toBe("pro");
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("should leave the header out when the screen supplies its own", () => {
    // Arrange / Act
    renderPicker({ showHeader: false });

    // Assert
    expect(screen.queryByRole("button", { name: "Open project…" })).not.toBeInTheDocument();
  });

  it("should explain an empty library", () => {
    // Arrange / Act
    renderPicker();

    // Assert
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
  });

  it("should list the five most recent projects, newest first, with a friendly date", async () => {
    // Arrange
    const native = createMockNative();
    const stores = createMockStores({ native });
    await seedLibrary(native, [
      fixtureProject({ id: "p1", name: "Oldest ever", modified: atOffset(90) }),
      fixtureProject({ id: "p2", name: "Euclid study 2", modified: atOffset(9) }),
      fixtureProject({ id: "p3", name: "Night bus", modified: atOffset(2) }),
      fixtureProject({ id: "p4", name: "Untitled Groove", modified: atOffset(0, 3) }),
      fixtureProject({ id: "p5", name: "Fifth", modified: atOffset(20) }),
      fixtureProject({ id: "p6", name: "Sixth", modified: atOffset(40) }),
    ]);
    await stores.library.getState().refresh();

    // Act
    renderPicker({}, stores);

    // Assert
    const rows = within(screen.getByRole("list", { name: "Recent projects" })).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => within(row).getByText(/^(Untitled Groove|Night bus|Euclid study 2|Fifth|Sixth|Oldest ever)$/).textContent)).toEqual([
      "Untitled Groove",
      "Night bus",
      "Euclid study 2",
      "Fifth",
      "Sixth",
    ]);
    expect(within(rows[0] as HTMLElement).getByText("Today")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Mon")).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("Oct 12")).toBeInTheDocument();
  });

  it("should open a recent project and report it opened", async () => {
    // Arrange
    const native = createMockNative();
    const stores = createMockStores({ native });
    await seedLibrary(native, [fixtureProject({ id: "p2", name: "Night bus", tags: ["late"], modified: atOffset(2) })]);
    await stores.library.getState().refresh();
    const { user, onOpened } = renderPicker({}, stores);

    // Act
    await user.click(screen.getByRole("button", { name: /Night bus/ }));

    // Assert
    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1));
    expect(stores.project.getState().project.name).toBe("Night bus");
    expect(stores.project.getState().dirty).toBe(false);
  });

  it("should open a recent project from its right-click menu", async () => {
    // Arrange
    const native = createMockNative();
    const stores = createMockStores({ native });
    await seedLibrary(native, [fixtureProject({ id: "p2", name: "Night bus", modified: atOffset(2) })]);
    await stores.library.getState().refresh();
    const { user, onOpened } = renderPicker({}, stores);
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: /Night bus/ }) });

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Open" }));

    // Assert
    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1));
    expect(stores.project.getState().project.name).toBe("Night bus");
  });

  it("should show a recent project in Finder from its right-click menu", async () => {
    // Arrange
    const native = createMockNative();
    const reveal = vi.spyOn(native, "revealInFinder").mockResolvedValue();
    const stores = createMockStores({ native });
    const [path] = await seedLibrary(native, [fixtureProject({ id: "p2", name: "Night bus", modified: atOffset(2) })]);
    await stores.library.getState().refresh();
    const { user } = renderPicker({}, stores);
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: /Night bus/ }) });

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Show in Finder" }));

    // Assert
    expect(reveal).toHaveBeenCalledWith(path);
  });

  it("should open the recent project menu from the keyboard with Shift+F10", async () => {
    // Arrange
    const native = createMockNative();
    const stores = createMockStores({ native });
    await seedLibrary(native, [fixtureProject({ id: "p2", name: "Night bus", modified: atOffset(2) })]);
    await stores.library.getState().refresh();
    const { user } = renderPicker({}, stores);
    screen.getByRole("button", { name: /Night bus/ }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Project Night bus" })).toBeInTheDocument();
  });

  it("should report a failed Show in Finder under the recent list", async () => {
    // Arrange
    const native = createMockNative();
    vi.spyOn(native, "revealInFinder").mockRejectedValue(new Error("Finder is busy"));
    const stores = createMockStores({ native });
    await seedLibrary(native, [fixtureProject({ id: "p2", name: "Night bus", modified: atOffset(2) })]);
    await stores.library.getState().refresh();
    const { user } = renderPicker({}, stores);
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: /Night bus/ }) });

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Show in Finder" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't show Night bus in Finder: Finder is busy");
  });

  it("should open the file chosen in the Open project dialog", async () => {
    // Arrange
    const native = createMockNative();
    const [path] = await seedLibrary(native, [fixtureProject({ id: "p9", name: "From disk" })]);
    const picked = vi.fn(async () => path ?? null);
    const stores = createMockStores({ native: { ...native, openDialog: picked } });
    const { user, onOpened } = renderPicker({}, stores);

    // Act
    await user.click(screen.getByRole("button", { name: "Open project…" }));

    // Assert
    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1));
    expect(stores.project.getState().project.name).toBe("From disk");
  });

  it("should do nothing when the Open project dialog is cancelled", async () => {
    // Arrange
    const { user, onOpened } = renderPicker();

    // Act
    await user.click(screen.getByRole("button", { name: "Open project…" }));

    // Assert
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("should import a strudel.cc link as a new project with one track per pattern", async () => {
    // Arrange
    const stores = createMockStores();
    const { user, onOpened } = renderPicker({}, stores);
    const link = toShareUrl('setcpm(100/4)\n$: s("bd*4")\n$: s("~ cp")');

    // Act
    await user.type(screen.getByRole("textbox", { name: "strudel.cc link" }), link);
    await user.click(screen.getByRole("button", { name: "Import" }));

    // Assert
    expect(stores.project.getState().project.tracks).toHaveLength(2);
    expect(stores.project.getState().project.tempo.bpm).toBe(100);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("should say short links can't be opened offline", async () => {
    // Arrange
    const stores = createMockStores();
    const { user, onOpened } = renderPicker({}, stores);

    // Act
    await user.type(screen.getByRole("textbox", { name: "strudel.cc link" }), "https://strudel.cc/?abc123xyz");
    await user.click(screen.getByRole("button", { name: "Import" }));

    // Assert
    expect(screen.getByText(SHORT_LINK_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "strudel.cc link" })).toBeInvalid();
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("should show a parse error inline with its line and column and keep the open project", async () => {
    // Arrange
    const stores = createMockStores();
    const before = stores.project.getState().project;
    const { user, onOpened } = renderPicker({}, stores);
    const link = toShareUrl('$: s("bd*4")\n$: s("hh*8").gain(');

    // Act
    await user.type(screen.getByRole("textbox", { name: "strudel.cc link" }), link);
    await user.click(screen.getByRole("button", { name: "Import" }));

    // Assert
    expect(screen.getByText(/\(line 2, column \d+\)/)).toBeInTheDocument();
    expect(stores.project.getState().project).toBe(before);
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("should audition the starter without saving it and restore the previous project on stop", async () => {
    // Arrange
    const stores = createMockStores();
    const before = stores.project.getState().project;
    const { user } = renderPicker({}, stores);

    // Act
    await user.click(screen.getByRole("button", { name: "Preview" }));

    // Assert: playing the House starter as a clean, unsaved preview
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));
    expect(stores.project.getState().project.tempo.bpm).toBe(124);
    expect(stores.project.getState().dirty).toBe(false);
    expect(stores.project.getState().filePath).toBeNull();

    // Act: stop
    await user.click(screen.getByRole("button", { name: "Stop preview" }));

    // Assert
    expect(stores.fakeEngine.playing).toBe(false);
    expect(stores.project.getState().project).toBe(before);
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("should follow tempo changes while auditioning", async () => {
    // Arrange
    const stores = createMockStores();
    const { user } = renderPicker({}, stores);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));

    // Act
    await user.click(screen.getByRole("button", { name: "Faster" }));

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(125);
  });

  it("should keep the created project when Continue is pressed during a preview", async () => {
    // Arrange
    const stores = createMockStores();
    const { user, unmount } = renderPicker({ initialStarter: "lofi" }, stores);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));

    // Act
    await user.click(screen.getByRole("button", { name: "Continue" }));
    unmount();

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(82);
    expect(stores.project.getState().dirty).toBe(true);
    expect(stores.fakeEngine.playing).toBe(false);
  });

  it("should put the previous project back if the picker unmounts mid-preview", async () => {
    // Arrange
    const stores = createMockStores();
    const before = stores.project.getState().project;
    const { user, unmount } = renderPicker({}, stores);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));

    // Act
    unmount();

    // Assert
    expect(stores.project.getState().project).toBe(before);
    expect(stores.fakeEngine.playing).toBe(false);
  });
});
