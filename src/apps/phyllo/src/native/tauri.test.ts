import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  emit: vi.fn(),
  windowListen: vi.fn(),
  label: 'main',
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
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen, emit: mocks.emit }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ label: mocks.label, listen: mocks.windowListen }),
}));
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
    ['midiListPorts', () => api.midiListPorts(), 'midi_list_ports', undefined],
    ['midiRescan', () => api.midiRescan(), 'midi_rescan', undefined],
    ['midiOpenInput', () => api.midiOpenInput('in:Pad:0'), 'midi_open_input', { id: 'in:Pad:0' }],
    ['midiCloseInput', () => api.midiCloseInput('in:Pad:0'), 'midi_close_input', { id: 'in:Pad:0' }],
    ['midiOpenOutput', () => api.midiOpenOutput('out:IAC:0'), 'midi_open_output', { id: 'out:IAC:0' }],
    ['midiCloseOutput', () => api.midiCloseOutput('out:IAC:0'), 'midi_close_output', { id: 'out:IAC:0' }],
    [
      'midiSend',
      () => api.midiSend('out:IAC:0', [{ bytes: [0x90, 60, 100], atMs: 12.5 }, { bytes: [0x80, 60, 0] }]),
      'midi_send',
      { id: 'out:IAC:0', messages: [{ bytes: [0x90, 60, 100], atMs: 12.5 }, { bytes: [0x80, 60, 0] }] },
    ],
    ['midiPanic', () => api.midiPanic('out:IAC:0'), 'midi_panic', { id: 'out:IAC:0' }],
    [
      'oscConfigure',
      () => api.oscConfigure({ enabled: true, host: '127.0.0.1', port: 57120 }),
      'osc_configure',
      { config: { enabled: true, host: '127.0.0.1', port: 57120 } },
    ],
    [
      'oscSend',
      () => api.oscSend([{ address: '/dirt/play', args: ['s', 'bd', 'n', 3], atMs: 20 }]),
      'osc_send',
      { messages: [{ address: '/dirt/play', args: ['s', 'bd', 'n', 3], atMs: 20 }] },
    ],
    [
      'exportBegin',
      () =>
        api.exportBegin({ path: 'mix.wav', format: 'wav', bitDepth: 24, sampleRate: 48000, channels: 2, normalizeDbfs: -1 }),
      'export_begin',
      {
        options: { path: 'mix.wav', format: 'wav', bitDepth: 24, sampleRate: 48000, channels: 2, normalizeDbfs: -1 },
      },
    ],
    ['exportFinish', () => api.exportFinish('s1'), 'export_finish', { sessionId: 's1' }],
    [
      'menuSetState',
      () => api.menuSetState({ id: 'transport.playPause', text: 'Pause', enabled: true }),
      'menu_set_state',
      { item: { id: 'transport.playPause', text: 'Pause', enabled: true } },
    ],
    [
      'menuSetRecent',
      () => api.menuSetRecent([{ path: '/p/a.phyllo', name: 'A' }]),
      'menu_set_recent',
      { items: [{ path: '/p/a.phyllo', name: 'A' }] },
    ],
    ['traySetEnabled', () => api.traySetEnabled(true), 'tray_set_enabled', { enabled: true }],
    ['traySetPlaying', () => api.traySetPlaying(false), 'tray_set_playing', { playing: false }],
    ['appSetKeepRunning', () => api.appSetKeepRunning(true), 'app_set_keep_running', { keep: true }],
    ['takePendingOpenFiles', () => api.takePendingOpenFiles(), 'take_pending_open_files', undefined],
    [
      'notifyExportFinished',
      () => api.notifyExportFinished({ title: 'Export finished', body: 'mix.wav', path: '/m/mix.wav' }),
      'notify_export_finished',
      { notification: { title: 'Export finished', body: 'mix.wav', path: '/m/mix.wav' } },
    ],
    ['exportCancel', () => api.exportCancel('s1'), 'export_cancel', { sessionId: 's1' }],
    [
      'soundCacheFetch',
      () => api.soundCacheFetch('https://strudel.b-cdn.net/piano.json'),
      'sound_cache_fetch',
      { url: 'https://strudel.b-cdn.net/piano.json' },
    ],
    ['soundCacheStatus', () => api.soundCacheStatus(), 'sound_cache_status', undefined],
    ['soundCacheClear', () => api.soundCacheClear(), 'sound_cache_clear', undefined],
    [
      'soundCachePrefetch',
      () => api.soundCachePrefetch(['https://strudel.b-cdn.net/a.wav', 'https://strudel.b-cdn.net/b.wav']),
      'sound_cache_prefetch',
      { urls: ['https://strudel.b-cdn.net/a.wav', 'https://strudel.b-cdn.net/b.wav'] },
    ],
    ['exportUniquePath', () => api.exportUniquePath('Groove.wav'), 'export_unique_path', { fileName: 'Groove.wav' }],
    [
      'midiFileWrite',
      () =>
        api.midiFileWrite('beat.mid', {
          bpm: 120,
          tracks: [{ name: 'Drums', channel: 10, notes: [{ startSec: 0, durationSec: 0.25, note: 36, velocity: 100 }] }],
        }),
      'midi_file_write',
      {
        path: 'beat.mid',
        spec: {
          bpm: 120,
          tracks: [{ name: 'Drums', channel: 10, notes: [{ startSec: 0, durationSec: 0.25, note: 36, velocity: 100 }] }],
        },
      },
    ],
  ];

  it('exportChunk sends the raw bytes as the body with the session in a header (binary IPC, not JSON)', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    const frames = new Float32Array([0.5, -0.5, 0.25, -0.25]);
    await api.exportChunk('s1', frames);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [command, body, options] = mocks.invoke.mock.calls[0] as [string, Uint8Array, { headers: Record<string, string> }];
    expect(command).toBe('export_chunk');
    expect(body).toBeInstanceOf(Uint8Array);
    expect(body.byteLength).toBe(16);
    expect(options).toEqual({ headers: { 'x-session': 's1' } });
    // Same memory, little-endian f32: no copy through JSON.
    expect(Array.from(new Float32Array(body.buffer, body.byteOffset, 4))).toEqual(Array.from(frames));
  });

  it('exportChunk respects a subarray view (byteOffset)', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    const whole = new Float32Array([9, 9, 1, 2, 9]);
    await api.exportChunk('s1', whole.subarray(2, 4));
    const body = mocks.invoke.mock.calls[0]![1] as Uint8Array;
    expect(body.byteLength).toBe(8);
    expect(Array.from(new Float32Array(body.buffer, body.byteOffset, 2))).toEqual([1, 2]);
  });

  it('exportChunk errors surface as NativeError', async () => {
    mocks.invoke.mockRejectedValue({ code: 'not_found', message: 'unknown export session: s9' });
    const err = await api.exportChunk('s9', new Float32Array(2)).catch((e: unknown) => e);
    expect(isNativeError(err, 'not_found')).toBe(true);
  });

  it.each(cases)('%s -> %s', async (_name, run, command, args) => {
    mocks.invoke.mockResolvedValue('result');
    expect(await run()).toBe('result');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(command, args);
  });

  it('COMMANDS lists exactly the commands registered in lib.rs', () => {
    expect(Object.values(COMMANDS).sort()).toEqual(
      [...cases.map((c) => c[2]), 'export_chunk', 'media_set_enabled', 'media_set_now_playing'].sort(),
    );
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

describe('tauri native: sound cache', () => {
  it('passes sound-cache://progress payloads through and unsubscribes', async () => {
    const unlisten = vi.fn();
    const progress = { done: 3, total: 10, failed: 1 };
    mocks.listen.mockImplementation((_event: string, handler: (e: { payload: unknown }) => void) => {
      handler({ payload: progress });
      return Promise.resolve(unlisten);
    });
    const cb = vi.fn();
    const off = await api.onSoundCacheProgress(cb);
    expect(mocks.listen).toHaveBeenCalledWith('sound-cache://progress', expect.any(Function));
    expect(EVENTS.soundCacheProgress).toBe('sound-cache://progress');
    expect(cb).toHaveBeenCalledWith(progress);
    off();
    expect(unlisten).toHaveBeenCalled();
  });

  it('surfaces a download failure as a network NativeError', async () => {
    mocks.invoke.mockRejectedValue({ code: 'network', message: 'network error: https://x: dns error' });
    const err = await api.soundCacheFetch('https://strudel.b-cdn.net/x.wav').catch((e: unknown) => e);
    expect(isNativeError(err, 'network')).toBe(true);
  });

  it('rejects a disallowed URL with invalid_argument', async () => {
    mocks.invoke.mockRejectedValue({ code: 'invalid_argument', message: 'sound URL not allowed' });
    const err = await api.soundCacheFetch('https://evil.example/x.wav').catch((e: unknown) => e);
    expect(isNativeError(err, 'invalid_argument')).toBe(true);
  });
});

describe('tauri native: MIDI events', () => {
  it('passes midi://message payloads through', async () => {
    const message = {
      portId: 'in:Pad:0',
      kind: 'noteon',
      channel: 1,
      data1: 60,
      data2: 100,
      status: 0x90,
      timestampUs: 5,
    };
    mocks.listen.mockImplementation((_event: string, handler: (e: { payload: unknown }) => void) => {
      handler({ payload: message });
      return Promise.resolve(() => undefined);
    });
    const cb = vi.fn();
    await api.onMidiMessage(cb);
    expect(mocks.listen).toHaveBeenCalledWith('midi://message', expect.any(Function));
    expect(EVENTS.midiMessage).toBe('midi://message');
    expect(cb).toHaveBeenCalledWith(message);
  });

  it('passes midi://ports-changed payloads through and unsubscribes', async () => {
    const unlisten = vi.fn();
    const ports = [{ id: 'out:IAC:0', name: 'IAC', direction: 'out' }];
    mocks.listen.mockImplementation((_event: string, handler: (e: { payload: unknown }) => void) => {
      handler({ payload: ports });
      return Promise.resolve(unlisten);
    });
    const cb = vi.fn();
    const off = await api.onMidiPortsChanged(cb);
    expect(mocks.listen).toHaveBeenCalledWith('midi://ports-changed', expect.any(Function));
    expect(cb).toHaveBeenCalledWith(ports);
    off();
    expect(unlisten).toHaveBeenCalled();
  });

  it('maps midi and osc error codes', async () => {
    mocks.invoke.mockRejectedValueOnce({ code: 'midi', message: 'MIDI error: boom' });
    expect(await api.midiOpenInput('x').catch((e: NativeError) => e.code)).toBe('midi');
    mocks.invoke.mockRejectedValueOnce({ code: 'osc', message: 'OSC error: boom' });
    expect(await api.oscSend([]).catch((e: NativeError) => e.code)).toBe('osc');
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
