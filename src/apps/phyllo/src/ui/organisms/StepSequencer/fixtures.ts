// Story/test fixtures for the Pattern editor organisms (House starter + a mockup-style "Drums" track).
import { createClip, createTrack } from "@phyllo/model";
import type { Project, Track } from "@phyllo/model";
import { fixtureProject } from "../../../state/mocks";

/** The mockup's one-call drum kit (`png/04-pattern-editor.png`). */
export function drumsTrack(overrides: Partial<Track> = {}): Track {
  return {
    ...createTrack("drum", {
      id: "drums",
      name: "Drums",
      color: "#7FD98A",
      pattern: "bd*4, [~ cp]*2, hh*8, [~ oh]*4",
      clips: [createClip(1, 32, "drums:c1")],
    }),
    ...overrides,
  };
}

/** A melodic note track that fits the piano roll. */
export function leadTrack(overrides: Partial<Track> = {}): Track {
  return {
    ...createTrack("melodic", {
      id: "lead",
      name: "Lead",
      color: "#B9A2FF",
      pattern: "a3 ~ c4 ~ e4 ~ a3 g3 ~ ~ e3 ~ g3 ~ a3 ~",
      clips: [createClip(1, 32, "lead:c1")],
    }),
    ...overrides,
  };
}

/** House starter (A minor) with the Drums and Lead tracks prepended; `selected` is the selected track. */
export function editorProject(selected = "drums", tracks: Track[] = [drumsTrack(), leadTrack()]): Project {
  const base = fixtureProject();
  return { ...base, tracks: [...tracks, ...base.tracks], ui: { ...base.ui, selectedTrack: selected } };
}
