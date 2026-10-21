import { createClip, createTrack } from "@phyllo/model";
import type { Modifier, Project, Track } from "@phyllo/model";
import { fixtureProject } from "../../../state/mocks";

/** House fixture (tracks `kick`, `clap`, `hats`, `bass`) with one track selected and optional track overrides. */
export function inspectorProject(selected: string | null, patch: Partial<Record<string, Partial<Track>>> = {}, extra: Track[] = []): Project {
  const base = fixtureProject();
  const tracks = [...base.tracks.map((t) => ({ ...t, ...patch[t.id] })), ...extra];
  return { ...base, tracks, ui: { ...base.ui, selectedTrack: selected } };
}

/** The bass from mockup 02: Pro knobs plus a three-modifier chain (the last one off). */
export const MOCKUP_BASS_MODIFIERS: Modifier[] = [
  { id: "m-sweep", code: ".lpf(sine.range(400, 1400).slow(8))", label: "Filter follows a slow sine · 8 cycles", enabled: true, origin: "suggestion" },
  { id: "m-ply", code: ".sometimes(x => x.ply(2))", label: "Doubles ~50% of notes", enabled: true, origin: "suggestion" },
  { id: "m-rev", code: ".lastOf(4, rev)", label: "Reverses the last cycle of every 4", enabled: false, origin: "suggestion" },
];

export const MOCKUP_BASS: Partial<Track> = {
  pattern: "<c2 eb2 g2 bb1>*2",
  params: { gain: 0.78, lpq: 10, shape: 0.3, room: 0.2, roomsize: 4 },
  modifiers: MOCKUP_BASS_MODIFIERS,
};

/** A track the parser couldn't map: plays verbatim, edited only in the code drawer. */
export function codeTrack(): Track {
  return createTrack("code", {
    id: "pad",
    name: "Pad",
    color: "#B9A2FF",
    clips: [createClip(1, 32, "pad-clip")],
    rawCode: 'n("0 2 4 <6 7>").scale("C:minor").s("gm_pad_warm").jux(rev).room(.6)',
  });
}
