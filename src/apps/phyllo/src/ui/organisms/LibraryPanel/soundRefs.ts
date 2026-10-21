import type { PreviewSound } from "@phyllo/engine";
import type { DrumSound, InstrumentSound, SynthSound } from "@phyllo/model";
import type { SoundRef } from "@phyllo/ui";
import type { SampleFile } from "../../../native/types";

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Last `parts` segments of a folder path, keeping a leading `~` or root, for the narrow panel. */
export function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

export function drumRef(sound: DrumSound, bank: string): SoundRef {
  return { source: "bank", name: sound.code, bank };
}

export function drumPreview(sound: DrumSound, bank: string): PreviewSound {
  return { s: sound.code, bank };
}

export function synthRef(entry: SynthSound | InstrumentSound): SoundRef {
  return { source: entry.group === "synth" ? "synth" : "soundfont", name: entry.code };
}

/** Synths play a low note, instruments a middle one: a short phrase is enough to hear the character. */
export function notePreview(entry: SynthSound | InstrumentSound): PreviewSound {
  return { s: entry.code, note: entry.group === "synth" ? "c3" : "c4" };
}

export function sampleRef(file: SampleFile): SoundRef {
  return { source: "sample", name: file.name };
}
