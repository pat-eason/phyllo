import { searchSounds } from "@phyllo/model";
import type { DrumBank, DrumSound, InstrumentSound, SoundEntry, SynthSound, UiMode } from "@phyllo/model";
import type { SoundRef } from "@phyllo/ui";
import { drumRef, sampleRef, synthRef } from "./soundRefs";
import type { SampleFolders } from "./useSampleFolders";

/** Drum machine the Sounds tab opens on. */
export const DEFAULT_BANK = "RolandTR909";

export interface SearchGroups {
  banks: DrumBank[];
  drums: DrumSound[];
  synths: SynthSound[];
  instruments: InstrumentSound[];
}

export function groupResults(results: readonly SoundEntry[]): SearchGroups {
  const groups: SearchGroups = { banks: [], drums: [], synths: [], instruments: [] };
  for (const entry of results) {
    if (entry.group === "bank") groups.banks.push(entry as DrumBank);
    else if (entry.group === "drum") groups.drums.push(entry as DrumSound);
    else if (entry.group === "synth") groups.synths.push(entry as SynthSound);
    else groups.instruments.push(entry as InstrumentSound);
  }
  return groups;
}

/** Bank a drum sound plays from: the selected machine when it has the sound, else the sound's first. */
export const bankFor = (sound: DrumSound, bank: string) => (sound.banks.includes(bank) ? bank : (sound.banks[0] ?? bank));

/** Sample files whose name contains the search text, in folder order. */
export function matchingSamples(samples: SampleFolders, query: string) {
  const needle = query.trim().toLowerCase();
  return samples.folders.flatMap((folder) => folder.scan.files.filter((file) => file.name.toLowerCase().includes(needle)));
}

/**
 * ⌘K quick add: the first insertable search result in the order the tab shows them (drum sounds, synths,
 * instruments, your samples; drum machines themselves aren't sounds). Null when nothing matches.
 */
export function topSoundResult(query: string, mode: UiMode, samples: SampleFolders, bank: string): SoundRef | null {
  if (query.trim() === "") return null;
  const groups = groupResults(searchSounds(query, mode));
  const drum = groups.drums[0];
  if (drum) return drumRef(drum, bankFor(drum, bank));
  const chip = groups.synths[0] ?? groups.instruments[0];
  if (chip) return synthRef(chip);
  const sample = matchingSamples(samples, query)[0];
  return sample ? sampleRef(sample) : null;
}
