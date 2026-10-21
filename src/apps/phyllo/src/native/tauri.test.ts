import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  reveal: vi.fn(),
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
  store: { get: vi.fn(), set: vi.fn(), save: vi.fn() },
  load: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  isTauri: () => true,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open, save: mocks.save }));
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: mocks.reveal }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: mocks.isPermissionGranted,
  requestPermission: mocks.requestPermission,
  sendNotification: mocks.sendNotification,
}));
vi.mock('@tauri-apps/plugin-store', () => ({ load: mocks.load }));

import { NativeError, isNativeError } from './errors';
import { createTauriApi } from './tauri';
import { COMMANDS, EVENTS } from './types';

const api = createTauriApi();

beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockResolvedValue(mocks.store);
});

describe('tauri native: command names and arguments', () => {
  const cases: [string, () => Promise<unknown>, string, Record<string, unknown> | undefined][] = [
    ['getPaths', () => api.getPaths(), 'paths_get', undefined],
    ['projectRead', () => api.projectRead('/p/a.phyllo'), 'project_read', { path: '/p/a.phyllo' }],
    ['projectWrite', () => api.projectWrite('/p/a.phyllo', '{}'), 'project_write', { path: '/p/a.phyllo', json: '{}' }],
    ['projectNewPath', () => api.projectNewPath('Groove'), 'project_new_path', { name: 'Groove' }],
    ['strudelRead', () => api.strudelRead('/p/a.strudel'), 'strudel_read', { path: '/p/a.strudel' }],
    ['strudelWrite', () => api.strudelWrite('/p/a.strudel', 'x'), 'strudel_write', { path: '/p/a.strudel', code: 'x' }],
    ['libraryScan', () => api.libraryScan(), 'library_scan', undefined],
    ['libraryMarkOpened', () => api.libraryMarkOpened('/p/a.phyllo'), 'library_mark_opened', { path: '/p/a.phyllo' }],
    ['libraryWatch', () => api.libraryWatch(), 'library_watch', undefined],
    ['historySnapshot', () => api.historySnapshot('id1', '{}'), 'history_snapshot', { projectId: 'id1', json: '{}' }],
    ['historyList', () => api.historyList('id1'), 'history_list', { projectId: 'id1' }],
    ['historyRead', () => api.historyRead('id1', 's1'), 'history_read', { projectId: 'id1', snapshotId: 's1' }],
    ['moveToTrash', () => api.moveToTrash('/p/a.phyllo'), 'move_to_trash', { path: '/p/a.phyllo' }],
    ['sampleFolderScan', () => api.sampleFolderScan('/s'), 'sample_folder_scan', { path: '/s' }],
    ['sampleFoldersWatch', () => api.sampleFoldersWatch(['/s', '/t']), 'sample_folders_watch', { paths: ['/s', '/t'] }],
  ];

  it.each(cases)('%s -> %s', async (_name, run, command, args) => {
    mocks.invoke.mockResolvedValue('result');
    expect(await run()).toBe('result');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(command, args);
  });

  it('COMMANDS lists exactly the commands registered in lib.rs', () => {
    expect(Object.values(COMMANDS).sort()).toEqual(cases.map((c) => c[2]).sort());
  });
});

describe('tauri native: errors', () => {
  it('normalizes { code, message } rejections to NativeError', async () => {
    mocks.invoke.mockRejectedValue({ code: 'invalid_format', message: 'missing "format" field' });
    const err = await api.projectWrite('/p', '{}').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NativeError);
    expect(isNativeError(err, 'invalid_format')).toBe(true);
    expect((err as NativeError).message).toBe('missing "format" field');
  });

  it('wraps string and Error rejections as unknown', async () => {
    mocks.invoke.mockRejectedValueOnce('boom');
    expect(await api.libraryScan().catch((e: NativeError) => e.code)).toBe('unknown');
    mocks.invoke.mockRejectedValueOnce(new Error('ipc closed'));
    expect(await api.libraryScan().catch((e: NativeError) => e.message)).toBe('ipc closed');
  });
});

describe('tauri native: events', () => {
  it('subscribes to library://changed and unsubscribes', async () => {
    const unlisten = vi.fn();
    mocks.listen.mockImplementation((_event: string, handler: (e: { payload: unknown }) => void) => {
      handler({ payload: null });
      return Promise.resolve(unlisten);
    });
    const cb = vi.fn();
    const off = await api.onLibraryChanged(cb);
    expect(mocks.listen).toHaveBeenCalledWith(EVENTS.libraryChanged, expect.any(Function));
    expect(EVENTS.libraryChanged).toBe('library://changed');
    expect(cb).toHaveBeenCalledWith();
    off();
    expect(unlisten).toHaveBeenCalled();
  });

  it('passes the samples://changed payload through', async () => {
    mocks.listen.mockImplementation((_event: string, handler: (e: { payload: unknown }) => void) => {
      handler({ payload: { folder: '/samples' } });
      return Promise.resolve(() => undefined);
    });
    const cb = vi.fn();
    await api.onSamplesChanged(cb);
    expect(mocks.listen).toHaveBeenCalledWith('samples://changed', expect.any(Function));
    expect(cb).toHaveBeenCalledWith({ folder: '/samples' });
  });
});

describe('tauri native: plugins', () => {
  it('dialogs pass options through and map undefined to null', async () => {
    mocks.open.mockResolvedValueOnce('/a.phyllo').mockResolvedValueOnce(null);
    const opts = { title: 'Open', filters: [{ name: 'Phyllo', extensions: ['phyllo'] }] };
    expect(await api.openDialog(opts)).toBe('/a.phyllo');
    expect(mocks.open).toHaveBeenCalledWith(opts);
    expect(await api.openDialog()).toBeNull();
    mocks.save.mockResolvedValueOnce('/b.wav');
    expect(await api.saveDialog({ defaultPath: 'x.wav' })).toBe('/b.wav');
    expect(mocks.save).toHaveBeenCalledWith({ defaultPath: 'x.wav' });
  });

  it('revealInFinder uses the opener plugin', async () => {
    await api.revealInFinder('/a/b.wav');
    expect(mocks.reveal).toHaveBeenCalledWith('/a/b.wav');
  });

  it('notify requests permission only when not yet granted', async () => {
    mocks.isPermissionGranted.mockResolvedValueOnce(true);
    expect(await api.notify({ title: 'Done', body: 'x.wav' })).toBe(true);
    expect(mocks.requestPermission).not.toHaveBeenCalled();
    expect(mocks.sendNotification).toHaveBeenCalledWith({ title: 'Done', body: 'x.wav' });

    mocks.isPermissionGranted.mockResolvedValueOnce(false);
    mocks.requestPermission.mockResolvedValueOnce('denied');
    expect(await api.notify({ title: 'Nope' })).toBe(false);
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);

    mocks.isPermissionGranted.mockResolvedValueOnce(false);
    mocks.requestPermission.mockResolvedValueOnce('granted');
    expect(await api.notify({ title: 'Yes' })).toBe(true);
    expect(mocks.sendNotification).toHaveBeenLastCalledWith({ title: 'Yes' });
  });

  it('convertFileSrc delegates to the core helper', () => {
    expect(api.convertFileSrc('/a b.wav')).toBe('asset://localhost/%2Fa%20b.wav');
  });

  it('settings store loads and saves settings.json', async () => {
    mocks.store.get.mockResolvedValueOnce(undefined);
    expect(await api.settingsStore.load()).toBeNull();
    expect(mocks.load).toHaveBeenCalledWith('settings.json', { autoSave: false });
    mocks.store.get.mockResolvedValueOnce({ uiMode: 'pro' });
    expect(await api.settingsStore.load()).toEqual({ uiMode: 'pro' });
    await api.settingsStore.save({ uiMode: 'guided' });
    expect(mocks.store.set).toHaveBeenCalledWith('settings', { uiMode: 'guided' });
    expect(mocks.store.save).toHaveBeenCalled();
  });
});
