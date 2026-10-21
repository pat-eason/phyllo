// Story/test fixtures: the House starter dressed up like png/05-mixer.png.
import type { Project, Track } from "@phyllo/model";
import { createFakeEngine } from "../../../state/fakeEngine";
import type { FakeEngine } from "../../../state/fakeEngine";
import { fixtureProject } from "../../../state/mocks";

export interface MixerFixtureOptions {
  selected?: string | null;
  /** Patch per track id. */
  tracks?: Record<string, Partial<Track>>;
  master?: Partial<Project["master"]>;
}

/**
 * House starter with mixer-ish settings: Kick `shape .15`, Bass `lpf ~sine`, `lpq 10`, `shape .3` on orbit 2,
 * Hats keep their patterned `.gain("[.4 .7]*4")`; bus 1 (3 tracks) roomsize 2, delaytime .125, delayfb .4.
 */
export function mixerProject(options: MixerFixtureOptions = {}): Project {
  const base = fixtureProject();
  const tracks = base.tracks.map((t): Track => {
    let next: Track = t;
    if (t.id === "kick") next = { ...t, params: { ...t.params, shape: 0.15, gain: 0.82 } };
    if (t.id === "clap") next = { ...t, params: { ...t.params, gain: 0.7, delay: 0.1 } };
    if (t.id === "bass") {
      const { lpf: _lpf, ...params } = t.params;
      next = {
        ...t,
        orbit: 2,
        params: { ...params, lpq: 10, shape: 0.3, room: 0.2 },
        modifiers: [{ id: "bass:m1", code: ".lpf(sine.range(400, 1400).slow(8))", label: "Filter sweep", enabled: true }],
      };
    }
    const patch = options.tracks?.[t.id];
    return patch ? { ...next, ...patch } : next;
  });
  return {
    ...base,
    tracks,
    buses: [
      { orbit: 1, roomsize: 2, delaytime: 0.125, delayfeedback: 0.4 },
      { orbit: 2, roomsize: 6, delayfeedback: 0.55 },
    ],
    master: { ...base.master, postgain: 0.9, ...options.master },
    ui: { ...base.ui, selectedTrack: options.selected === undefined ? "bass" : options.selected },
  };
}

/** A ready fake engine that is already playing, so meters move. */
export function playingEngine(): FakeEngine {
  const engine = createFakeEngine({ ready: true });
  engine.play();
  return engine;
}
