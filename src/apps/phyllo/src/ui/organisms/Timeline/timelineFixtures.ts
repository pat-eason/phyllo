import { createClip, createModifier, createTrack, TRACK_COLORS } from "@phyllo/model";
import type { Project, Track, TrackKind, TrackSource } from "@phyllo/model";
import { fixtureProject } from "../../../state/mocks";

/** Stories and tests only: the seven tracks of the Arrange mockup (`Main.dc.html`). */

interface Spec {
  id: string;
  name: string;
  kind: TrackKind;
  pattern: string;
  source: Partial<TrackSource>;
  clips: [number, number][];
  modifiers?: string[];
}

const SPECS: Spec[] = [
  { id: "kick", name: "Kick", kind: "drum", pattern: "bd*4", source: { bank: "RolandTR909" }, clips: [[9, 16], [21, 32]] },
  { id: "clap", name: "Clap", kind: "drum", pattern: "~ cp", source: { bank: "RolandTR909" }, clips: [[9, 16], [21, 32]] },
  { id: "hats", name: "Hats", kind: "drum", pattern: "hh*8", source: { bank: "RolandTR909" }, clips: [[1, 8], [9, 16], [21, 32]] },
  {
    id: "bass",
    name: "Bass",
    kind: "melodic",
    pattern: "<c2 eb2 g2 bb1>*2",
    source: { type: "note", sound: "sawtooth" },
    clips: [[9, 16], [21, 32]],
  },
  {
    id: "keys",
    name: "Keys",
    kind: "chord",
    pattern: "<Cm7 Fm7 Ab^7 G7>",
    source: { type: "chord", sound: "gm_epiano1" },
    clips: [[1, 8], [9, 16], [17, 20], [25, 32]],
  },
  { id: "lead", name: "Lead", kind: "melodic", pattern: "c4 [eb4 g4] ~ bb4", source: { type: "note", sound: "triangle" }, clips: [[21, 32]] },
  {
    id: "vox",
    name: "Vox chop",
    kind: "sample",
    pattern: "vox",
    source: { type: "s", sound: "vox" },
    clips: [[17, 20], [29, 32]],
    modifiers: [".chop(8)"],
  },
];

function trackFrom(spec: Spec, index: number): Track {
  return createTrack(spec.kind, {
    id: spec.id,
    name: spec.name,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    pattern: spec.pattern,
    source: spec.source,
    modifiers: (spec.modifiers ?? []).map((code, i) => createModifier(code, { id: `${spec.id}-m${i + 1}` })),
    clips: spec.clips.map(([start, end], i) => createClip(start, end, `${spec.id}-c${i + 1}`)),
  });
}

/** The mockup arrangement: 7 tracks, Intro/Groove/Break/Drop, loop 9–16, Bass selected. */
export function arrangeProject(overrides: Partial<Project> = {}): Project {
  const base = fixtureProject();
  return {
    ...base,
    tracks: SPECS.map(trackFrom),
    sections: [
      { id: "intro", name: "Intro", startBar: 1, endBar: 8 },
      { id: "groove", name: "Groove", startBar: 9, endBar: 16 },
      { id: "break", name: "Break", startBar: 17, endBar: 20 },
      { id: "drop", name: "Drop", startBar: 21, endBar: 32 },
    ],
    loop: { enabled: true, startBar: 9, endBar: 16 },
    ui: { selectedTrack: "bass", zoom: 1 },
    ...overrides,
  };
}

/** Replaces some tracks' fields by id. */
export function withTracks(project: Project, patch: Record<string, Partial<Track>>): Project {
  return { ...project, tracks: project.tracks.map((t) => (patch[t.id] ? { ...t, ...patch[t.id] } : t)) };
}

/** `count` drum tracks, each with clips over the whole `bars`-bar song in 4-bar blocks (performance test). */
export function largeProject(count: number, bars: number): Project {
  const base = fixtureProject();
  const tracks = Array.from({ length: count }, (_, i) =>
    createTrack("drum", {
      id: `t${i + 1}`,
      name: `Track ${i + 1}`,
      color: TRACK_COLORS[i % TRACK_COLORS.length],
      pattern: i % 2 ? "hh*8" : "<bd*4 [bd ~ bd ~]>",
      source: { bank: "RolandTR909" },
      clips: Array.from({ length: bars / 4 }, (_, c) => createClip(c * 4 + 1, c * 4 + 4, `t${i + 1}-c${c + 1}`)),
    }),
  );
  return { ...base, lengthBars: bars, tracks, ui: { selectedTrack: null, zoom: 1 } };
}
