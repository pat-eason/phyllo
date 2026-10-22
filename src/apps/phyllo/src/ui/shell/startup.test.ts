import { describe, expect, it } from "vitest";
import { planStart } from "./startup";

describe("planStart", () => {
  const last = "/Phyllo/a.phyllo";

  it("should open Guided start when the library is empty", () => {
    // Arrange / Act
    const plan = planStart({ explicit: null, libraryCount: 0, reopenLast: false, lastProject: last });

    // Assert
    expect(plan).toEqual({ route: { screen: "start" }, reopen: null, fallback: { screen: "start" } });
  });

  it("should open the Library when grooves exist and reopening is off", () => {
    // Arrange / Act
    const plan = planStart({ explicit: null, libraryCount: 2, reopenLast: false, lastProject: last });

    // Assert
    expect(plan).toEqual({ route: { screen: "library" }, reopen: null, fallback: { screen: "library" } });
  });

  it("should reopen last session's project in Arrange when enabled, falling back to the Library", () => {
    // Arrange / Act
    const plan = planStart({ explicit: null, libraryCount: 2, reopenLast: true, lastProject: last });

    // Assert
    expect(plan).toEqual({ route: { screen: "arrange" }, reopen: last, fallback: { screen: "library" } });
  });

  it("should show the Library when enabled but nothing was open last session", () => {
    // Arrange / Act
    const plan = planStart({ explicit: null, libraryCount: 3, reopenLast: true, lastProject: null });

    // Assert
    expect(plan.route).toEqual({ screen: "library" });
  });

  it("should keep a project screen from the URL when reopening", () => {
    // Arrange / Act
    const plan = planStart({ explicit: { screen: "mixer" }, libraryCount: 1, reopenLast: true, lastProject: last });

    // Assert
    expect(plan.route).toEqual({ screen: "mixer" });
  });

  it("should keep a non-project screen from the URL and still reopen behind it", () => {
    // Arrange / Act
    const plan = planStart({ explicit: { screen: "settings" }, libraryCount: 1, reopenLast: true, lastProject: last });

    // Assert
    expect(plan).toEqual({ route: { screen: "settings" }, reopen: last, fallback: { screen: "settings" } });
  });
});
