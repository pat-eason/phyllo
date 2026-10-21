import type { NativeApi } from "../../../native/api";
import type { MidiPortInfo, SampleScan, SoundCacheProgress, SoundCacheStatus } from "../../../native/types";
import { createMockNative } from "../../../state/mocks";

/** Ports for stories and tests: two controllers in, a virtual bus out. */
export const SAMPLE_MIDI_PORTS: readonly MidiPortInfo[] = [
  { id: "in:KeyStep 37:0", name: "KeyStep 37", direction: "in" },
  { id: "in:Launch Control XL:0", name: "Launch Control XL", direction: "in" },
  { id: "out:IAC Driver Bus 1:0", name: "IAC Driver Bus 1", direction: "out" },
];

export const SAMPLE_FOLDERS: Readonly<Record<string, number>> = {
  "/Users/pat/Music/Samples": 312,
  "/Users/pat/Splice/Packs/Dusty Keys": 1204,
};

export interface SettingsNativeOptions {
  ports?: readonly MidiPortInfo[];
  /** Linked folder path -> file count. Unknown paths scan as empty; `null` makes the scan fail (folder missing). */
  folders?: Readonly<Record<string, number | null>>;
  /** What the dialog "Link a folder…" returns. */
  pickedFolder?: string | null;
  cacheStatus?: SoundCacheStatus;
}

export interface SettingsNativeControls {
  native: NativeApi;
  /** URLs handed to `soundCachePrefetch`, oldest call first. */
  prefetchCalls: string[][];
  /** Send a `sound-cache://progress` event to the open listeners. */
  emitProgress(progress: SoundCacheProgress): void;
  /** Resolve the pending `soundCachePrefetch` with its final counts. */
  finishPrefetch(progress: SoundCacheProgress): void;
  /** Replace the MIDI port list and notify `onMidiPortsChanged` listeners (a hot-plug). */
  plug(ports: readonly MidiPortInfo[]): void;
  /** Paths revealed in Finder. */
  revealed: string[];
  cleared: { count: number };
}

/**
 * The in-memory browser `NativeApi` with a seeded MIDI port list, sample folders, folder dialog and a sound cache
 * whose prefetch stays open until the test (or story) finishes it.
 */
export function createSettingsNative(options: SettingsNativeOptions = {}): SettingsNativeControls {
  const base = createMockNative();
  let ports: readonly MidiPortInfo[] = options.ports ?? SAMPLE_MIDI_PORTS;
  const folders = options.folders ?? SAMPLE_FOLDERS;
  let cacheStatus: SoundCacheStatus = options.cacheStatus ?? { files: 0, bytes: 0 };

  const portListeners = new Set<(list: MidiPortInfo[]) => void>();
  const progressListeners = new Set<(progress: SoundCacheProgress) => void>();
  let finishCurrent: ((progress: SoundCacheProgress) => void) | null = null;

  const controls: SettingsNativeControls = {
    native: base,
    prefetchCalls: [],
    revealed: [],
    cleared: { count: 0 },
    emitProgress(progress) {
      for (const listener of [...progressListeners]) listener({ ...progress });
    },
    finishPrefetch(progress) {
      cacheStatus = { files: progress.done - progress.failed, bytes: (progress.done - progress.failed) * 41_000 };
      finishCurrent?.(progress);
      finishCurrent = null;
    },
    plug(next) {
      ports = next;
      for (const listener of [...portListeners]) listener([...next]);
    },
  };

  controls.native = {
    ...base,
    midiListPorts: async () => [...ports],
    midiRescan: async () => [...ports],
    onMidiPortsChanged: async (callback) => {
      portListeners.add(callback);
      return () => portListeners.delete(callback);
    },
    sampleFolderScan: async (path): Promise<SampleScan> => {
      const count = folders[path];
      if (count === null) throw new Error("not found");
      return {
        path,
        files: Array.from({ length: count ?? 0 }, (_, index) => ({ name: `sample${index}`, path: `${path}/sample${index}.wav`, ext: "wav" })),
      };
    },
    sampleFoldersWatch: async () => {},
    openDialog: async () => options.pickedFolder ?? null,
    revealInFinder: async (path) => {
      controls.revealed.push(path);
    },
    soundCacheStatus: async () => ({ ...cacheStatus }),
    soundCacheClear: async () => {
      controls.cleared.count += 1;
      cacheStatus = { files: 0, bytes: 0 };
    },
    soundCachePrefetch: (urls) => {
      controls.prefetchCalls.push([...urls]);
      return new Promise<SoundCacheProgress>((resolve) => {
        finishCurrent = resolve;
      });
    },
    onSoundCacheProgress: async (callback) => {
      progressListeners.add(callback);
      return () => progressListeners.delete(callback);
    },
  };
  return controls;
}
