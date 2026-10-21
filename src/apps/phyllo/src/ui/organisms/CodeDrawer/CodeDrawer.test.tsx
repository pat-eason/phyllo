import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fixtureProject } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import type { MockStoresOptions } from "../../../state/mocks";
import { TipCoach } from "../TipCoach";
import { CodeDrawer } from "./CodeDrawer";
import { BROKEN_COLUMN, fakeEngineWithErrorColumn, projectWithBrokenTrack } from "./fixtures";

const PRO = { initialSettings: { uiMode: "pro" as const } };

function renderDrawer(options: MockStoresOptions = {}) {
  const result = renderWithStores(<CodeDrawer />, options);
  act(() => result.stores.engine.getState().regenerateNow());
  return result;
}

const codeRegion = () => screen.getByLabelText("Generated Strudel code");

/** The rendered code line whose text is exactly `text`. */
const getLine = (text: string) =>
  within(codeRegion()).getByText((_, element) => element?.parentElement === codeRegion() && element.textContent === text);

/** The header summary, which mixes plain text with live spans. */
const getSummary = (pattern: RegExp) =>
  screen.getByText((_, element) => element?.tagName === "SPAN" && pattern.test(element.textContent ?? "") && element.children.length > 0);

/** Pro opens on "This section"; these tests look at the whole-song program. */
async function showWholeSong(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Whole song · arrange()" }));
}

describe("CodeDrawer", () => {
  it("should start collapsed in Guided with the plain-language summary", () => {
    // Arrange / Act
    renderDrawer();

    // Assert
    expect(screen.getByText("Phyllo writes Strudel as you work — 4 patterns ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show code" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Generated Strudel code")).not.toBeInTheDocument();
  });

  it("should count only audible tracks in the Guided summary", () => {
    // Arrange
    const project = fixtureProject();
    const tracks = project.tracks.map((t) => (t.id === "hats" ? { ...t, mute: true } : t));

    // Act
    renderDrawer({ initialProject: { ...project, tracks } });

    // Assert
    expect(screen.getByText("Phyllo writes Strudel as you work — 3 patterns ready")).toBeInTheDocument();
  });

  it("should open on Show code in Guided and close again on Hide code", async () => {
    // Arrange
    const user = userEvent.setup();
    renderDrawer();

    // Act
    await user.click(screen.getByRole("button", { name: "Show code" }));

    // Assert
    expect(codeRegion()).toHaveTextContent('$: arrange([8, silence], [24, note("<a1 a1 c2 g1>*2").s("sawtooth").lpf(900)])');
    await user.click(screen.getByRole("button", { name: "Hide code" }));
    expect(screen.queryByLabelText("Generated Strudel code")).not.toBeInTheDocument();
  });

  it("should start open in Pro on This section", () => {
    // Arrange / Act
    renderDrawer(PRO);

    // Assert
    expect(screen.getByRole("button", { name: "Hide code" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radio", { name: "This section · Intro" })).toBeChecked();
    expect(getSummary(/^Intro · bars 1–8 · evaluated \d+\.\d s ago · no errors$/)).toBeInTheDocument();
    expect(getLine("setcpm(124/4)")).toBeInTheDocument();
  });

  it("should say the patterns are playing in the Guided summary only while playing", () => {
    // Arrange
    const { stores } = renderDrawer();

    // Act
    act(() => stores.transport.setState({ playing: true }));

    // Assert
    expect(screen.getByText("Phyllo writes Strudel as you work — 4 patterns playing")).toBeInTheDocument();
  });

  it("should keep the whole-song scope the user picked when the drawer mounts again", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores, unmount } = renderDrawer(PRO);
    await showWholeSong(user);
    unmount();

    // Act
    renderWithStores(<CodeDrawer />, { stores });

    // Assert
    expect(screen.getByRole("radio", { name: "Whole song · arrange()" })).toBeChecked();
    expect(getSummary(/^Whole song · bars 1–32 · /)).toBeInTheDocument();
  });

  it("should render only the section's tracks after switching to This section", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderDrawer(PRO);
    act(() => stores.transport.getState().seek(13));

    // Act
    await user.click(screen.getByRole("radio", { name: /^This section/ }));

    // Assert
    expect(getLine('$: s("bd*4").bank("RolandTR909")')).toBeInTheDocument();
    expect(getSummary(/^Groove · bars 9–16 · /)).toBeInTheDocument();
    expect(codeRegion()).not.toHaveTextContent("arrange(");
  });

  it("should highlight the selected track's lines and only those", async () => {
    // Arrange
    const user = userEvent.setup();
    const project = fixtureProject({ ui: { selectedTrack: "bass", zoom: 1 } });
    const { stores } = renderDrawer({ ...PRO, initialProject: project });
    act(() => stores.transport.getState().seek(13));

    // Act
    await user.click(screen.getByRole("radio", { name: /^This section/ }));

    // Assert
    expect(getLine('$: note("<a1 a1 c2 g1>*2").s("sawtooth").lpf(900)')).toHaveAttribute("data-highlighted");
    expect(getLine('$: s("bd*4").bank("RolandTR909")')).not.toHaveAttribute("data-highlighted");
  });

  it("should copy a strudel.cc link of the shown code and confirm it", async () => {
    // Arrange
    const user = userEvent.setup();
    renderDrawer(PRO);

    // Act
    await user.click(screen.getByRole("button", { name: "Copy strudel.cc link" }));

    // Assert
    expect(await navigator.clipboard.readText()).toMatch(/^https:\/\/strudel\.cc\/#.+/);
    expect(screen.getByRole("button", { name: "Link copied" })).toBeInTheDocument();
    expect(screen.getByText("strudel.cc link copied to the clipboard")).toBeInTheDocument();
  });

  it("should complete the share tip when the link is copied", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(
      <>
        <TipCoach />
        <CodeDrawer />
      </>,
      { initialSettings: { tips: { hidden: false, step: 5 }, codeDrawer: { open: true } } },
    );
    expect(screen.getByText("Take it with you")).toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("button", { name: "Copy strudel.cc link" }));

    // Assert
    expect(screen.queryByText("Take it with you")).not.toBeInTheDocument();
  });

  it("should show an evaluation error under its line and in the status", async () => {
    // Arrange / Act
    renderDrawer({ ...PRO, initialProject: projectWithBrokenTrack() });
    await showWholeSong(userEvent.setup());

    // Assert
    expect(getLine('$: s("bd*4").gain(ERROR)')).toHaveAttribute("data-error");
    expect(getLine("ERROR is not defined")).toBeInTheDocument();
    expect(screen.getByText("Line 18: ERROR is not defined")).toBeInTheDocument();
    expect(screen.getByText("error on line 18")).toBeInTheDocument();
  });

  it("should name the failing track under the header while the code is hidden", () => {
    // Arrange / Act
    renderDrawer({ initialProject: projectWithBrokenTrack() });

    // Assert
    expect(screen.getByText("Broken: ERROR is not defined")).toBeInTheDocument();
  });

  it("should point a caret at the error column when the engine reports one", () => {
    // Arrange / Act
    renderDrawer({ ...PRO, initialProject: projectWithBrokenTrack(), engine: fakeEngineWithErrorColumn(BROKEN_COLUMN) });

    // Assert
    expect(getLine(`${" ".repeat(BROKEN_COLUMN - 1)}^ ERROR is not defined`)).toBeInTheDocument();
  });

  it("should commit an edited source pattern on Enter as an undoable change", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderDrawer(PRO);
    await showWholeSong(user);
    await user.click(screen.getAllByRole("button", { name: 'Edit pattern for Bass: "<a1 a1 c2 g1>*2"' })[0] as HTMLElement);

    // Act
    const input = screen.getByRole("textbox", { name: "Pattern for Bass" });
    await user.clear(input);
    await user.type(input, "c2*4{Enter}");
    act(() => stores.engine.getState().regenerateNow());

    // Assert
    expect(codeRegion()).toHaveTextContent('note("c2*4")');
    act(() => stores.project.getState().undo());
    act(() => stores.engine.getState().regenerateNow());
    expect(codeRegion()).toHaveTextContent('note("<a1 a1 c2 g1>*2")');
  });

  it("should keep the last valid pattern while the edited one doesn't parse", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderDrawer(PRO);
    await user.click(screen.getAllByRole("button", { name: 'Edit pattern for Kick: "bd*4"' })[0] as HTMLElement);
    const input = screen.getByRole("textbox", { name: "Pattern for Kick" });

    // Act
    await user.clear(input);
    await user.type(input, "bd*[[{Enter}");

    // Assert
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/\^/);
    expect(stores.project.getState().project.tracks[0]?.pattern).toBe("bd*4");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Pattern for Kick" })).not.toBeInTheDocument();
  });

  it("should show the parse error with line and column and leave the song unchanged in Edit code", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderDrawer(PRO);
    const before = stores.project.getState().project;
    await user.click(screen.getByRole("button", { name: "Edit code" }));
    const editor = screen.getByRole("textbox", { name: "Strudel code for the whole song" });

    // Act
    await user.clear(editor);
    await user.type(editor, '$: s("bd*4"');
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // Assert
    expect(screen.getByRole("alert")).toHaveTextContent(/^Line 1, column \d+: /);
    expect(stores.project.getState().project).toBe(before);
  });

  it("should apply edited code to the song and undo it in one step", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderDrawer(PRO);
    await user.click(screen.getByRole("button", { name: "Edit code" }));
    const editor = screen.getByRole("textbox", { name: "Strudel code for the whole song" });

    // Act
    await user.clear(editor);
    await user.type(editor, 'setcpm(124/4){Enter}$: s("bd*2").bank("RolandTR909")');
    await user.click(screen.getByRole("button", { name: "Apply" }));
    act(() => stores.engine.getState().regenerateNow());

    // Assert
    expect(screen.queryByRole("textbox", { name: "Strudel code for the whole song" })).not.toBeInTheDocument();
    expect(codeRegion()).toHaveTextContent('s("bd*2")');
    act(() => stores.project.getState().undo());
    expect(stores.project.getState().project.tracks).toHaveLength(4);
  });

  it("should grow and shrink the open code area from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    renderDrawer(PRO);
    const handle = screen.getByRole("separator", { name: "Resize code drawer" });
    handle.focus();

    // Act
    await user.keyboard("{ArrowUp}{ArrowUp}");

    // Assert
    expect(handle).toHaveAttribute("aria-valuenow", "228");
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(handle).toHaveAttribute("aria-valuenow", "164");
  });
});
