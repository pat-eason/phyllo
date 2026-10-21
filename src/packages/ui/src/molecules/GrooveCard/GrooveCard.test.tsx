import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { NIGHT_BUS_PREVIEW } from "../_shared/punchcardFixtures";
import { GrooveCard, type GrooveCardData } from "./GrooveCard";

const groove: GrooveCardData = {
  name: "Night bus",
  bpm: 82,
  key: "F major",
  lengthBars: 48,
  trackCount: 3,
  tags: [
    { label: "lo-fi", color: "var(--ph-track-5)" },
    { label: "chill", color: "var(--ph-track-2)" },
  ],
  favorite: false,
  editedLabel: "Today, 12:41",
  preview: NIGHT_BUS_PREVIEW,
};

function setup(props: Partial<ComponentProps<typeof GrooveCard>> = {}) {
  const handlers = { onOpen: vi.fn(), onPreview: vi.fn(), onFavoriteChange: vi.fn() };
  const utils = render(<GrooveCard groove={groove} {...handlers} {...props} />);
  return { ...handlers, ...utils };
}

function setupRow(props: Partial<ComponentProps<typeof GrooveCard>> = {}) {
  const handlers = { onOpen: vi.fn(), onPreview: vi.fn(), onFavoriteChange: vi.fn() };
  const utils = render(
    <table>
      <tbody>
        <GrooveCard groove={groove} variant="row" {...handlers} {...props} />
      </tbody>
    </table>,
  );
  return { ...handlers, ...utils };
}

describe("GrooveCard tile", () => {
  it("should be an article with a heading, meta line, tags and edited label", () => {
    // Arrange / Act
    setup();

    // Assert
    const tile = screen.getByRole("article");
    expect(within(tile).getByRole("heading", { name: "Night bus" })).toBeInTheDocument();
    expect(within(tile).getByText("82 BPM · F major · 48 bars")).toBeInTheDocument();
    expect(within(tile).getByText("lo-fi")).toBeInTheDocument();
    expect(within(tile).getByText("chill")).toBeInTheDocument();
    expect(within(tile).getByText("Today, 12:41")).toBeInTheDocument();
  });

  it("should call onOpen from the cover", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onOpen } = setup();

    // Act
    await user.click(screen.getByRole("button", { name: "Open Night bus" }));

    // Assert
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("should call onPreview from the Play button without opening", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onPreview, onOpen } = setup();

    // Act
    await user.click(screen.getByRole("button", { name: "Play Night bus" }));

    // Assert
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("should reflect previewing in aria-pressed", () => {
    // Arrange / Act
    setup({ previewing: true });

    // Assert
    expect(screen.getByRole("button", { name: "Play Night bus" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each([true, false])("should reflect favorite=%s and pass the next value to onFavoriteChange", async (favorite) => {
    // Arrange
    const user = userEvent.setup();
    const { onFavoriteChange } = setup({ groove: { ...groove, favorite } });
    const star = screen.getByRole("button", { name: "Favorite Night bus" });

    // Act
    await user.click(star);

    // Assert
    expect(star).toHaveAttribute("aria-pressed", String(favorite));
    expect(onFavoriteChange).toHaveBeenCalledWith(!favorite);
  });

  it("should toggle favorite from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onFavoriteChange } = setup();
    screen.getByRole("button", { name: "Favorite Night bus" }).focus();

    // Act
    await user.keyboard("{Enter}");

    // Assert
    expect(onFavoriteChange).toHaveBeenCalledWith(true);
  });

  it.each([1, 2] as const)("should hide meta and tags at size %i", (size) => {
    // Arrange / Act
    setup({ size });

    // Assert
    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
    expect(screen.queryByText("lo-fi")).not.toBeInTheDocument();
    expect(screen.getByText("Today, 12:41")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Night bus" })).toBeInTheDocument();
  });

  it.each([3, 4, 5] as const)("should show meta and tags at size %i", (size) => {
    // Arrange / Act
    setup({ size });

    // Assert
    expect(screen.getByText(/82 BPM/)).toBeInTheDocument();
    expect(screen.getByText("lo-fi")).toBeInTheDocument();
  });

  it("should forward ref, className and native props to the article", () => {
    // Arrange
    const ref = createRef<HTMLElement>();
    const onContextMenu = vi.fn();

    // Act
    setup({ ref, className: "extra", onContextMenu });
    screen.getByRole("article").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

    // Assert
    expect(ref.current).toBe(screen.getByRole("article"));
    expect(ref.current).toHaveClass("extra");
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });
});

describe("GrooveCard row", () => {
  it("should render a table row with all cells", () => {
    // Arrange / Act
    setupRow();

    // Assert
    const row = screen.getByRole("row");
    expect(within(row).getAllByRole("cell")).toHaveLength(9);
    expect(within(row).getByText("Night bus")).toBeInTheDocument();
    expect(within(row).getByText("lo-fi")).toBeInTheDocument();
    expect(within(row).getByText("82")).toBeInTheDocument();
    expect(within(row).getByText("F major")).toBeInTheDocument();
    expect(within(row).getByText("48 bars")).toBeInTheDocument();
    expect(within(row).getByText("3 tracks")).toBeInTheDocument();
    expect(within(row).getByText("Today, 12:41")).toBeInTheDocument();
  });

  it("should open from the name button", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onOpen } = setupRow();

    // Act
    await user.click(screen.getByRole("button", { name: "Night bus" }));

    // Assert
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("should preview and favorite with the same labels as the tile", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onPreview, onFavoriteChange } = setupRow({ previewing: true });

    // Act
    await user.click(screen.getByRole("button", { name: "Play Night bus" }));
    await user.click(screen.getByRole("button", { name: "Favorite Night bus" }));

    // Assert
    expect(screen.getByRole("button", { name: "Play Night bus" })).toHaveAttribute("aria-pressed", "true");
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onFavoriteChange).toHaveBeenCalledWith(true);
  });

  it("should forward ref and native props to the tr", () => {
    // Arrange
    const ref = createRef<HTMLElement>();

    // Act
    setupRow({ ref });

    // Assert
    expect(ref.current).toBe(screen.getByRole("row"));
    expect(ref.current?.tagName).toBe("TR");
  });
});

describe("GrooveCard states", () => {
  it("should disable the play button and ignore its click when previewDisabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onPreview } = setup({ previewDisabled: true });

    // Act
    await user.click(screen.getByRole("button", { name: "Play Night bus" }));

    // Assert
    expect(screen.getByRole("button", { name: "Play Night bus" })).toBeDisabled();
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("should mark a selected row with aria-selected", () => {
    // Arrange / Act
    setupRow({ selected: true });

    // Assert
    expect(screen.getByRole("row")).toHaveAttribute("aria-selected", "true");
  });

  it("should not set aria-selected on an unselected row", () => {
    // Arrange / Act
    setupRow();

    // Assert
    expect(screen.getByRole("row")).not.toHaveAttribute("aria-selected");
  });

  it("should flag a selected tile with data-selected", () => {
    // Arrange / Act
    setup({ selected: true });

    // Assert
    expect(screen.getByRole("article")).toHaveAttribute("data-selected");
  });

  it("should disable the row play button when previewDisabled", () => {
    // Arrange / Act
    setupRow({ previewDisabled: true });

    // Assert
    expect(screen.getByRole("button", { name: "Play Night bus" })).toBeDisabled();
  });
});
