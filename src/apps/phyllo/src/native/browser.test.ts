import { describe, expect, it, vi } from 'vitest';

import type { NativeApi } from './api';
import { BROWSER_ROOT, STORAGE_KEY, createBrowserApi } from './browser';
import { NativeError } from './errors';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const project = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'phyllo/1',
    id: 'p1',
    name: 'P1',
    tags: ['house'],
    favorite: true,
    created: '2026-10-21T12:00:00Z',
    modified: '2026-10-21T12:41:00Z',
    tempo: { bpm: 124, beatsPerBar: 4 },
    key: 'C minor',
    lengthBars: 32,
    tracks: [
      { kind: 'drum', color: '#7FD98A', pattern: 'bd*4', source: { type: 's' }, mute: false },
      { kind: 'melodic', color: '#F5C25B', pattern: 'c2', source: { type: 'note' }, mute: true },
      { kind: 'chord', color: '#8AB4FF', pattern: '<Cm>', source: { type: 'chord' } },
      { kind: 'sample', color: '#B9A2FF', pattern: 'vox', source: { type: 's' } },
    ],
    ...extra,
  });

async function rejection(promise: Promise<unknown>): Promise<NativeError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(NativeError);
    return err as NativeError;
  }
  throw new Error('expected a rejection');
}

const fresh = (storage: ReturnType<typeof memoryStorage> | null = null) =>
  createBrowserApi({ storage, log: () => undefined });

describe('browser native: seeding and basics', () => {
  it('starts with zero projects and null dialogs', async () => {
    const api = fresh();
    expect(api.kind).toBe('browser');
    expect(await api.libraryScan()).toEqual({ entries: [], errors: [] });
    expect(await api.openDialog()).toBeNull();
    expect(await api.saveDialog()).toBeNull();
    expect(await api.getPaths()).toEqual({ root: BROWSER_ROOT, exports: `${BROWSER_ROOT}/Exports` });
    expect(await api.sampleFolderScan('/x')).toEqual({ path: '/x', files: [] });
    expect(api.convertFileSrc('/a/b.wav')).toBe('/a/b.wav');
  });

  it('notify and reveal log instead of throwing', async () => {
    const log = vi.fn();
    const api = createBrowserApi({ storage: null, log });
    expect(await api.notify({ title: 'Export finished', body: 'x.wav' })).toBe(false);
    await api.revealInFinder('/a');
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('settings store round-trips and defaults to null', async () => {
    const storage = memoryStorage();
    const api = fresh(storage);
    expect(await api.settingsStore.load()).toBeNull();
    await api.settingsStore.save({ uiMode: 'pro' });
    expect(await api.settingsStore.load()).toEqual({ uiMode: 'pro' });
    expect(await fresh(storage).settingsStore.load()).toEqual({ uiMode: 'pro' });
  });
});

describe('browser native: project IO', () => {
  it('validates before writing', async () => {
    const api = fresh();
    expect((await rejection(api.projectWrite('/Phyllo/a.phyllo', 'nope'))).code).toBe('json');
    expect((await rejection(api.projectWrite('/Phyllo/a.phyllo', '{"name":"x"}'))).code).toBe('invalid_format');
    expect((await rejection(api.projectRead('/Phyllo/a.phyllo'))).code).toBe('not_found');
  });

  it('round-trips project and strudel text', async () => {
    const api = fresh();
    await api.projectWrite('/Phyllo/a.phyllo', project());
    expect(await api.projectRead('/Phyllo/a.phyllo')).toBe(project());
    await api.strudelWrite('/Phyllo/t.strudel', '$: s("bd")');
    expect(await api.strudelRead('/Phyllo/t.strudel')).toBe('$: s("bd")');
  });

  it('projectNewPath sanitizes and suffixes collisions', async () => {
    const api = fresh();
    const first = await api.projectNewPath('My Groove');
    expect(first).toBe('/Phyllo/My Groove.phyllo');
    await api.projectWrite(first, project());
    const second = await api.projectNewPath('My Groove');
    expect(second).toBe('/Phyllo/My Groove 2.phyllo');
    await api.projectWrite(second, project());
    expect(await api.projectNewPath('My Groove')).toBe('/Phyllo/My Groove 3.phyllo');
    expect(await api.projectNewPath('a/b:c')).toBe('/Phyllo/a-b-c.phyllo');
    expect(await api.projectNewPath('   ')).toBe('/Phyllo/Untitled Groove.phyllo');
  });

  it('persists to localStorage and reloads', async () => {
    const storage = memoryStorage();
    const api = fresh(storage);
    await api.projectWrite('/Phyllo/a.phyllo', project());
    await api.libraryMarkOpened('/Phyllo/a.phyllo');
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    const reloaded = fresh(storage);
    const scan = await reloaded.libraryScan();
    expect(scan.entries).toHaveLength(1);
    expect(scan.entries[0]?.opened).not.toBeNull();
  });

  it('survives unusable storage', async () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const api = createBrowserApi({ storage: broken, log: () => undefined });
    await api.projectWrite('/Phyllo/a.phyllo', project());
    expect((await api.libraryScan()).entries).toHaveLength(1);
  });
});

describe('browser native: library', () => {
  it('summarizes valid projects (first 3 tracks) and reports invalid ones', async () => {
    const api = fresh();
    await api.projectWrite('/Phyllo/b.phyllo', project({ name: 'B' }));
    await api.projectWrite('/Phyllo/a.phyllo', project({ name: 'A' }));
    // Bypass validation the way a hand-edited file on disk would.
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        files: { '/Phyllo/bad.phyllo': { content: '{ nope', modifiedMs: 1 } },
        opened: {},
      }),
    });
    const withBad = fresh(storage);
    await withBad.projectWrite('/Phyllo/ok.phyllo', project());
    const scan = await withBad.libraryScan();
    expect(scan.errors.map((e) => e.path)).toEqual(['/Phyllo/bad.phyllo']);

    const { entries } = await api.libraryScan();
    expect(entries.map((e) => e.summary.name)).toEqual(['A', 'B']);
    const s = entries[0]!.summary;
    expect(s).toMatchObject({ bpm: 124, beatsPerBar: 4, key: 'C minor', lengthBars: 32, trackCount: 4, favorite: true });
    expect(s.tracks).toHaveLength(3);
    expect(s.tracks[1]).toEqual({ kind: 'melodic', color: '#F5C25B', pattern: 'c2', sourceType: 'note', mute: true });
    expect(entries[0]?.opened).toBeNull();
  });

  it('ignores nested paths and non-phyllo files', async () => {
    const api = fresh();
    await api.projectWrite('/Phyllo/.history/x/a.phyllo', project());
    await api.strudelWrite('/Phyllo/notes.strudel', 'x');
    expect((await api.libraryScan()).entries).toEqual([]);
  });

  it('fires onLibraryChanged on write and trash, and stops after unsubscribe', async () => {
    const api = fresh();
    const cb = vi.fn();
    const off = await api.onLibraryChanged(cb);
    await api.projectWrite('/Phyllo/a.phyllo', project());
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
    await api.moveToTrash('/Phyllo/a.phyllo');
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(2);
    expect((await api.libraryScan()).entries).toEqual([]);
    off();
    await api.projectWrite('/Phyllo/b.phyllo', project());
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(2);
    expect((await rejection(api.moveToTrash('/Phyllo/nope.phyllo'))).code).toBe('not_found');
  });
});

describe('browser native: history', () => {
  const snap = async (api: NativeApi, n: number) => api.historySnapshot('p1', project({ rev: n }));

  it('lists newest first and reads snapshots back', async () => {
    let t = Date.parse('2026-10-21T12:00:00Z');
    const api = createBrowserApi({ storage: null, now: () => new Date((t += 1000)), log: () => undefined });
    const a = await snap(api, 1);
    const b = await snap(api, 2);
    expect((await api.historyList('p1')).map((s) => s.id)).toEqual([b.id, a.id]);
    expect(a).toMatchObject({ takenAt: '2026-10-21T12:00:01.000Z', id: '20261021T120001000Z' });
    expect(JSON.parse(await api.historyRead('p1', a.id)).rev).toBe(1);
    expect(a.sizeBytes).toBe(new TextEncoder().encode(project({ rev: 1 })).length);
    expect(await api.historyList('other')).toEqual([]);
    expect((await rejection(api.historyRead('p1', 'zzz'))).code).toBe('not_found');
  });

  it('keeps only the newest 50, even within one millisecond', async () => {
    const api = createBrowserApi({ storage: null, now: () => new Date('2026-10-21T12:00:00Z'), log: () => undefined });
    for (let i = 0; i < 60; i += 1) await snap(api, i);
    const list = await api.historyList('p1');
    expect(list).toHaveLength(50);
    expect(JSON.parse(await api.historyRead('p1', list[0]!.id)).rev).toBe(59);
    expect(JSON.parse(await api.historyRead('p1', list[49]!.id)).rev).toBe(10);
  });

  it('rejects invalid documents', async () => {
    const api = fresh();
    expect((await rejection(api.historySnapshot('p1', '{}'))).code).toBe('invalid_format');
  });
});
