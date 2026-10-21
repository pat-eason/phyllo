import { fixtureProject } from "../../../state/mocks";
import type { MockStoresOptions } from "../../../state/mocks";

/** Where the story project "lives" (shown shortened in the status bar). */
export const STORY_FILE = "/Users/pat/Music/Phyllo/Untitled Groove.phyllo";

export const KEYSTEP_PORT = "in:KeyStep 37:0";

/** The mockups' project: "Untitled Groove", C minor, 120 BPM in 4/4. */
export const mockupProject = () =>
  fixtureProject({ name: "Untitled Groove", key: "C minor", tempo: { bpm: 120, beatsPerBar: 4 } });

/** Mock-store options shared by the header and status bar stories and tests: the mockup project and a MIDI keyboard. */
export function storeOptions(overrides: MockStoresOptions = {}): MockStoresOptions {
  return {
    initialProject: mockupProject(),
    ...overrides,
    initialSettings: {
      midi: { enabledPorts: [KEYSTEP_PORT] },
      ...overrides.initialSettings,
    },
  };
}
