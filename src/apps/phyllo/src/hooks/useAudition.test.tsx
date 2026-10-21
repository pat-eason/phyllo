import type { Project } from "@phyllo/model";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fixtureProject } from "../state/mocks";
import { renderWithStores } from "../state/testUtils";
import { useAudition } from "./useAudition";

const verse: Project = fixtureProject({
  id: "prj_verse",
  name: "Verse",
  lengthBars: 16,
  sections: [{ id: "s1", name: "Verse", startBar: 5, endBar: 8 }],
});
const chorus: Project = fixtureProject({ id: "prj_chorus", name: "Chorus" });

/** Two independent surfaces sharing the audition slot, like the groove library and the starter picker. */
function Surfaces({ build }: { build: () => Promise<Project> }) {
  const library = useAudition();
  const picker = useAudition();
  return (
    <div>
      <p>library: {library.auditioning ?? "idle"}</p>
      <p>picker: {picker.auditioning ?? "idle"}</p>
      <button type="button" onClick={() => void library.audition("verse", build, { startBar: (p) => p.sections[0]?.startBar })}>
        Audition verse
      </button>
      <button type="button" onClick={() => void picker.audition("chorus", chorus)}>
        Audition chorus
      </button>
      <button type="button" onClick={() => void library.audition("broken", () => Promise.reject(new Error("unreadable"))).catch(() => {})}>
        Audition broken
      </button>
      <button type="button" onClick={picker.stop}>
        Stop
      </button>
    </div>
  );
}

describe("useAudition", () => {
  it("should start playing from the bar the options pick", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<Surfaces build={() => Promise.resolve(verse)} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Audition verse" }));

    // Assert
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));
    expect(stores.transport.getState().position.bar).toBe(5);
    expect(stores.project.getState().project.name).toBe("Verse");
  });

  it("should allow one audition at a time across hook users and restore the first project on stop", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<Surfaces build={() => Promise.resolve(verse)} />);
    const before = stores.project.getState().project;
    await user.click(screen.getByRole("button", { name: "Audition verse" }));
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));

    // Act
    await user.click(screen.getByRole("button", { name: "Audition chorus" }));

    // Assert
    await waitFor(() => expect(screen.getByText("library: chorus")).toBeInTheDocument());
    expect(screen.getByText("picker: chorus")).toBeInTheDocument();
    expect(stores.project.getState().project.name).toBe("Chorus");

    // Act
    await user.click(screen.getByRole("button", { name: "Stop" }));

    // Assert
    expect(stores.project.getState().project).toBe(before);
    expect(screen.getByText("library: idle")).toBeInTheDocument();
    expect(stores.fakeEngine.playing).toBe(false);
  });

  it("should leave the open project alone when the source can't be read", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<Surfaces build={() => Promise.resolve(verse)} />);
    const before = stores.project.getState().project;

    // Act
    await user.click(screen.getByRole("button", { name: "Audition broken" }));

    // Assert
    await waitFor(() => expect(screen.getByText("library: idle")).toBeInTheDocument());
    expect(stores.project.getState().project).toBe(before);
    expect(stores.fakeEngine.playing).toBe(false);
  });

  it("should not restore over a project the user opened during the audition", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<Surfaces build={() => Promise.resolve(verse)} />);
    await user.click(screen.getByRole("button", { name: "Audition chorus" }));
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));
    const opened = fixtureProject({ id: "prj_other", name: "Opened elsewhere" });

    // Act
    stores.project.getState().loadProject(opened, { filePath: "/Music/other.phyllo", dirty: false });
    await user.click(screen.getByRole("button", { name: "Stop" }));

    // Assert
    expect(stores.project.getState().project).toBe(opened);
  });
});
