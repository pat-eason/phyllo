import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithStores } from "../../../state/testUtils";
import { AccentPicker } from "./AccentPicker";

describe("AccentPicker", () => {
  it("should apply the chosen theme at once", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<AccentPicker />);

    // Act
    await user.click(within(screen.getByRole("radiogroup", { name: "Theme" })).getByRole("radio", { name: "Light" }));

    // Assert
    expect(stores.settings.getState().settings.appearance.mode).toBe("light");
  });

  it("should check the saved theme in the Dark, Light, Match system group", () => {
    // Arrange
    renderWithStores(<AccentPicker />, { initialSettings: { appearance: { mode: "system" } } });

    // Act
    const theme = within(screen.getByRole("radiogroup", { name: "Theme" }));

    // Assert
    expect(theme.getByRole("radio", { name: "Match system" })).toBeChecked();
    expect(theme.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  it("should apply the chosen accent at once", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<AccentPicker />);

    // Act
    await user.click(screen.getByRole("radio", { name: "Blue" }));

    // Assert
    expect(stores.settings.getState().settings.appearance.accent).toBe("blue");
    expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
  });

  it("should make only the checked swatch a tab stop", () => {
    // Arrange
    renderWithStores(<AccentPicker />);

    // Act
    const accents = within(screen.getByRole("radiogroup", { name: "Accent" }));

    // Assert
    expect(accents.getByRole("radio", { name: "Green" })).toHaveAttribute("tabindex", "0");
    expect(accents.getByRole("radio", { name: "Red" })).toHaveAttribute("tabindex", "-1");
  });

  it("should select and focus the next swatch on ArrowRight and wrap at the end", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<AccentPicker />, { initialSettings: { appearance: { accent: "teal" } } });
    const accents = within(screen.getByRole("radiogroup", { name: "Accent" }));
    accents.getByRole("radio", { name: "Teal" }).focus();

    // Act
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(stores.settings.getState().settings.appearance.accent).toBe("green");
    expect(accents.getByRole("radio", { name: "Green" })).toHaveFocus();
  });

  it("should select the previous swatch on ArrowLeft and wrap at the start", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<AccentPicker />);
    const accents = within(screen.getByRole("radiogroup", { name: "Accent" }));
    accents.getByRole("radio", { name: "Green" }).focus();

    // Act
    await user.keyboard("{ArrowLeft}");

    // Assert
    expect(accents.getByRole("radio", { name: "Teal" })).toBeChecked();
  });

  it("should jump to the last swatch on End", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<AccentPicker />, { initialSettings: { appearance: { accent: "blue" } } });
    const accents = within(screen.getByRole("radiogroup", { name: "Accent" }));
    accents.getByRole("radio", { name: "Blue" }).focus();

    // Act
    await user.keyboard("{End}");

    // Assert
    expect(accents.getByRole("radio", { name: "Teal" })).toBeChecked();
    expect(accents.getByRole("radio", { name: "Teal" })).toHaveFocus();
  });

  it("should jump to the first swatch on Home", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<AccentPicker />, { initialSettings: { appearance: { accent: "blue" } } });
    const accents = within(screen.getByRole("radiogroup", { name: "Accent" }));
    accents.getByRole("radio", { name: "Blue" }).focus();

    // Act
    await user.keyboard("{Home}");

    // Assert
    expect(accents.getByRole("radio", { name: "Green" })).toBeChecked();
    expect(accents.getByRole("radio", { name: "Green" })).toHaveFocus();
  });

  it("should explain that record and mute turn magenta while Red is the accent", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<AccentPicker />);

    // Act
    await user.click(screen.getByRole("radio", { name: "Red" }));

    // Assert
    expect(screen.getByRole("note")).toHaveTextContent(/record and mute turn magenta/i);
  });

  it("should not show the magenta note for other accents", () => {
    // Arrange
    renderWithStores(<AccentPicker />, { initialSettings: { appearance: { accent: "purple" } } });

    // Act
    const note = screen.queryByRole("note");

    // Assert
    expect(note).not.toBeInTheDocument();
  });

  it("should keep the preview out of the accessibility tree", () => {
    // Arrange
    renderWithStores(<AccentPicker />);

    // Act
    const play = screen.queryByRole("button", { name: "Play" });

    // Assert
    expect(play).not.toBeInTheDocument();
  });
});
