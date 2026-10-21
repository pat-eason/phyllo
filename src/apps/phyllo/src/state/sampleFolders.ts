import type { PhylloEngine } from "@phyllo/engine";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { NativeApi } from "../native/api";
import type { SampleScan } from "../native/types";
import type { EngineHost } from "./engineHost";
import type { Unsubscribe } from "./feed";
import type { SettingsStoreState } from "./settingsStore";

/** One linked folder's last scan. */
export interface SampleFolderInfo {
  path: string;
  /** Sounds registered from this folder (after cross-folder renames). */
  names: readonly string[];
  /** Message of the last failed scan (unplugged drive, permissions); its previous sounds are dropped. */
  error: string | null;
}

/** A user sample as registered with Strudel. */
export interface RegisteredSample {
  /** Strudel sound name (`s("vox")`), unique across every linked folder. */
  name: string;
  path: string;
  folder: string;
}

export interface SampleFoldersState {
  /** Every registered sound name, in folder order then file order (Inspector, Library). */
  names: readonly string[];
  samples: readonly RegisteredSample[];
  folders: readonly SampleFolderInfo[];
  /** A scan is in flight. */
  scanning: boolean;
  /** Re-scan every linked folder now and re-register. */
  rescan(): Promise<void>;
}

export interface SampleFoldersDeps {
  native: NativeApi;
  settings: StoreApi<SettingsStoreState>;
  host: EngineHost;
  onError?: (message: string, error: unknown) => void;
}

export interface SampleFoldersHandle {
  store: StoreApi<SampleFoldersState>;
  /** First scan + watch, then follow `settings.sampleFolders` and the watcher. Idempotent. */
  start(): Promise<void>;
  dispose(): void;
}

/**
 * Merges per-folder scans into one name space, deterministically by folder order (SPEC §4.5): Rust already made
 * names unique inside a folder, so a name an earlier folder took gets the next free numeric suffix
 * (`vox` → `vox2`, `vox3`…, the same scheme as `samples.rs`).
 */
export function mergeSampleScans(scans: readonly SampleScan[]): RegisteredSample[] {
  const used = new Set<string>();
  const out: RegisteredSample[] = [];
  for (const scan of scans) {
    for (const file of scan.files) {
      let name = file.name;
      for (let n = 2; used.has(name); n++) name = `${file.name}${n}`;
      used.add(name);
      out.push({ name, path: file.path, folder: scan.path });
    }
  }
  return out;
}

/** `{ name: [url] }` for Strudel's `samples()`. */
export function sampleMapOf(samples: readonly RegisteredSample[], toUrl: (path: string) => string): Record<string, string[]> {
  return Object.fromEntries(samples.map((s) => [s.name, [toUrl(s.path)]]));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * User sample folders → Strudel (B1): scans every linked folder, watches them all, and registers
 * `{ name: [convertFileSrc(path)] }` with the engine once it exists (and again after each re-scan). Only new or
 * moved names are sent again; Strudel cannot unregister a sound, so a deleted file's name stays playable until reload.
 */
export function createSampleFolders(deps: SampleFoldersDeps): SampleFoldersHandle {
  const { native, host } = deps;
  const onError = deps.onError ?? (() => {});
  const cleanups: Unsubscribe[] = [];
  /** Last good scan per folder path. */
  const scans = new Map<string, SampleScan>();
  const errors = new Map<string, string>();
  /** name → url already handed to the engine. */
  const registered = new Map<string, string>();
  const reportedErrors = new Set<string>();
  const scanSeq = new Map<string, number>();
  let watched: readonly string[] = [];
  let generation = 0;
  let disposed = false;
  let started: Promise<void> | undefined;

  const folderPaths = () => deps.settings.getState().settings.sampleFolders;

  const register = (engine: PhylloEngine, samples: readonly RegisteredSample[]) => {
    const fresh: RegisteredSample[] = [];
    for (const sample of samples) {
      const url = native.convertFileSrc(sample.path);
      if (registered.get(sample.name) === url) continue;
      registered.set(sample.name, url);
      fresh.push(sample);
    }
    if (!fresh.length) return;
    engine.registerSamples(sampleMapOf(fresh, (p) => native.convertFileSrc(p))).catch((error: unknown) => {
      for (const sample of fresh) registered.delete(sample.name);
      onError("Couldn't load your samples", error);
    });
  };

  const publish = () => {
    const paths = folderPaths();
    const samples = mergeSampleScans(paths.flatMap((p) => scans.get(p) ?? []));
    const byFolder = new Map<string, string[]>();
    for (const s of samples) byFolder.set(s.folder, [...(byFolder.get(s.folder) ?? []), s.name]);
    store.setState({
      samples,
      names: samples.map((s) => s.name),
      folders: paths.map((path) => ({ path, names: byFolder.get(path) ?? [], error: errors.get(path) ?? null })),
    });
    const engine = host.peek();
    if (engine) register(engine, samples);
  };

  const scanFolder = async (path: string) => {
    const n = (scanSeq.get(path) ?? 0) + 1;
    scanSeq.set(path, n);
    // A newer scan of the same folder (or unlinking it) wins over a slow older one.
    const current = () => scanSeq.get(path) === n && folderPaths().includes(path);
    try {
      const scan = await native.sampleFolderScan(path);
      if (!current()) return;
      scans.set(path, scan);
      errors.delete(path);
    } catch (error) {
      if (!current()) return;
      scans.delete(path);
      const message = errorMessage(error);
      errors.set(path, message);
      const key = `${path}\u0000${message}`;
      if (!reportedErrors.has(key)) {
        reportedErrors.add(key);
        onError(`Couldn't scan sample folder ${path}`, error);
      }
    }
  };

  /** Scan `only` (default: every linked folder), drop unlinked folders, re-watch when the set changed, publish. */
  const sync = async (only?: string) => {
    const gen = ++generation;
    const paths = [...folderPaths()];
    for (const path of [...scans.keys()]) if (!paths.includes(path)) scans.delete(path);
    for (const path of [...errors.keys()]) if (!paths.includes(path)) errors.delete(path);
    if (!sameList(paths, watched) && (paths.length || watched.length)) {
      watched = paths;
      native.sampleFoldersWatch(paths).catch((error: unknown) => onError("Couldn't watch sample folders", error));
    }
    const targets = only !== undefined ? paths.filter((p) => p === only) : paths;
    if (!targets.length) {
      if (only === undefined) publish();
      return;
    }
    store.setState({ scanning: true });
    await Promise.all(targets.map(scanFolder));
    if (disposed) return;
    if (gen === generation) store.setState({ scanning: false });
    publish();
  };

  const store = createStore<SampleFoldersState>()(() => ({
    names: [],
    samples: [],
    folders: [],
    scanning: false,
    rescan: () => sync(),
  }));

  cleanups.push(
    host.onCreate((engine) => {
      registered.clear(); // a fresh engine has none of them
      register(engine, store.getState().samples);
    }),
  );

  return {
    store,
    start() {
      started ??= (async () => {
        cleanups.push(
          deps.settings.subscribe((state, prev) => {
            if (!sameList(state.settings.sampleFolders, prev.settings.sampleFolders)) void sync();
          }),
        );
        try {
          const off = await native.onSamplesChanged((event) => {
            if (folderPaths().includes(event.folder)) void sync(event.folder);
          });
          if (disposed) off();
          else cleanups.push(off);
        } catch (error) {
          onError("Couldn't follow sample folder changes", error);
        }
        await sync();
      })();
      return started;
    },
    dispose() {
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
