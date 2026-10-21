import { describe, expect, it } from "vitest";
import { planStart } from "./startup";

describe("planStart", () => {
  it("should open Guided start on first launch (no saved settings, empty library)", () => {
    // Arrange / Act
    const plan = planStart({ explicit: null, hadSavedSettings: false, libraryCount: 0, lastProject: "/Phyllo/a.phyllo" });

    // Assert
    expect(plan).toEqual({ route: { screen: "start" }, reopen: null, fallback: { screen: "start" } });
  });

  it("should reopen last session's project in Arrange, falling back to the Library", () => {
    // Arrange / Act
    const plan = planStart({ explicit: null, hadSavedSettings: true, libraryCount: 2, lastProject: "/Phyllo/a.phyllo" });

    // Assert
    expect(plan).toEqual({ route: { screen: "arrange" }, reopen: "/Phyllo/a.phyllo", fallback: { screen: "library" } });
  });

  it("should keep a project screen from the URL when reopening", () => {
    // Arrange / Act
    const plan = planStart({ explicit: { screen: "mixer" }, hadSavedSettings: true, libraryCount: 1, lastProject: "/Phyllo/a.phyllo" });

    // Assert
    expect(plan.route).toEqual({ screen: "mixer" });
  });

  it("should show the Library when nothing was open last session", () => {
    // Arrange / Act
    const saved = planStart({ explicit: null, hadSavedSettings: true, libraryCount: 0, lastProject: null });
    const grooves = planStart({ explicit: { screen: "arrange" }, hadSavedSettings: false, libraryCount: 3, lastProject: null });

    // Assert
    expect(saved.route).toEqual({ screen: "library" });
    expect(grooves.route).toEqual({ screen: "library" });
  });

  it("should keep a non-project screen from the URL and still reopen behind it", () => {
    // Arrange / Act
    const plan = planStart({ explicit: { screen: "settings" }, hadSavedSettings: true, libraryCount: 1, lastProject: "/Phyllo/a.phyllo" });

    // Assert
    expect(plan).toEqual({ route: { screen: "settings" }, reopen: "/Phyllo/a.phyllo", fallback: { screen: "settings" } });
  });
});
