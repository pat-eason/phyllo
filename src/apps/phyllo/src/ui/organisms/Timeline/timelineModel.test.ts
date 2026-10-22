import { describe, expect, it } from "vitest";
import { isPrimaryPress } from "./timelineModel";

describe("timelineModel", () => {
  it("should treat a plain left press as primary", () => {
    // Arrange / Act / Assert
    expect(isPrimaryPress({ button: 0, ctrlKey: false }, true)).toBe(true);
  });

  it("should treat Ctrl+click on macOS as a right-click, not a primary press", () => {
    // Arrange / Act / Assert
    expect(isPrimaryPress({ button: 0, ctrlKey: true }, true)).toBe(false);
  });

  it("should keep Ctrl+click primary elsewhere", () => {
    // Arrange / Act / Assert
    expect(isPrimaryPress({ button: 0, ctrlKey: true }, false)).toBe(true);
  });

  it("should never treat a right button press as primary", () => {
    // Arrange / Act / Assert
    expect(isPrimaryPress({ button: 2, ctrlKey: false }, false)).toBe(false);
  });
});
