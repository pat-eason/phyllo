import type { GrooveSummary } from "@phyllo/model";
import { describe, expect, it } from "vitest";
import { mediaAction, menuStates, recentItems } from "./bridgeModel";

function groove(name: string, opened: string | null): GrooveSummary {
  return {
    id: name,
    path: `/Phyllo/${name}.phyllo`,
    name,
    tags: [],
    favorite: false,
    bpm: 120,
    key: "C minor",
    lengthBars: 32,
    trackCount: 1,
    created: "2026-10-01T00:00:00.000Z",
    modified: "2026-10-01T00:00:00.000Z",
    opened,
    preview: [],
  };
}

describe("bridgeModel", () => {
  it("should list opened grooves newest first, after the last clear, up to the limit", () => {
    // Arrange
    const grooves = [
      groove("Old", "2026-10-01T10:00:00.000Z"),
      groove("Never", null),
      groove("Newest", "2026-10-20T10:00:00.000Z"),
      groove("Middle", "2026-10-10T10:00:00.000Z"),
    ];

    // Act
    const all = recentItems(grooves, 0);
    const afterClear = recentItems(grooves, Date.parse("2026-10-05T00:00:00.000Z"));
    const limited = recentItems(grooves, 0, 1);

    // Assert
    expect(all.map((item) => item.name)).toEqual(["Newest", "Middle", "Old"]);
    expect(afterClear).toEqual([
      { path: "/Phyllo/Newest.phyllo", name: "Newest" },
      { path: "/Phyllo/Middle.phyllo", name: "Middle" },
    ]);
    expect(limited).toHaveLength(1);
  });

  it("should label Play/Pause and check Loop, Record and the theme in the menu", () => {
    // Arrange / Act
    const states = menuStates({ playing: true, loop: false, recordArmed: true, uiMode: "guided", themeMode: "light" });

    // Assert
    expect(states).toEqual([
      { id: "transport.playPause", text: "Pause" },
      { id: "transport.loop", checked: false },
      { id: "transport.record", checked: true },
      { id: "view.uiMode", text: "Switch to Pro" },
      { id: "view.theme.dark", checked: false },
      { id: "view.theme.light", checked: true },
      { id: "view.theme.system", checked: false },
    ]);
  });

  it("should map media keys to transport actions", () => {
    // Arrange / Act / Assert
    expect(mediaAction("toggle", false)).toBe("transport.playPause");
    expect(mediaAction("play", false)).toBe("transport.playPause");
    expect(mediaAction("play", true)).toBeNull();
    expect(mediaAction("pause", true)).toBe("transport.playPause");
    expect(mediaAction("pause", false)).toBeNull();
    expect(mediaAction("stop", true)).toBe("transport.stop");
    expect(mediaAction("previous", true)).toBe("transport.backToStart");
    expect(mediaAction("next", true)).toBeNull();
  });
});
