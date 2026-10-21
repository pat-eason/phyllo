import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStores } from "../state/context";
import type { MidiInputState } from "../state/midiInput";
import type { RecorderState } from "../state/recorder";
import type { SampleFoldersState } from "../state/sampleFolders";

export type UseRecorder = Pick<RecorderState, "armed" | "recording" | "arm" | "lastTake">;

/**
 * MIDI record (SPEC §6.1): `arm(on)` sets the transport's record arm; while armed and playing, note-ons from enabled
 * inputs are captured, and on stop they become the selected track's new pattern (16ths, one undo step).
 * `lastTake` reports what the last take did (`written` with its pattern, or `empty` / `noTrack` / `unsupported`).
 */
export function useRecorder(): UseRecorder {
  const { recorder } = useAppStores();
  return useStore(
    recorder,
    useShallow((s) => ({ armed: s.armed, recording: s.recording, arm: s.arm, lastTake: s.lastTake })),
  );
}

/** Sound names from the linked sample folders (`s("<name>")`), in folder then file order. */
export function useSampleNames(): readonly string[] {
  const { samples } = useAppStores();
  return useStore(samples, (s) => s.names);
}

/** The registered user samples with their folders, per-folder results and the scanning flag. */
export function useSamples(): SampleFoldersState {
  const { samples } = useAppStores();
  return useStore(
    samples,
    useShallow((s) => ({ ...s })),
  );
}

/** Open MIDI inputs and the one-time "start audio first" hint (status bar / toast). */
export function useMidiInput(): MidiInputState {
  const { midiInput } = useAppStores();
  return useStore(
    midiInput,
    useShallow((s) => ({ ...s })),
  );
}
