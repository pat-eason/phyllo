import { beforeEach, describe, expect, it, vi } from 'vitest';

import errorRs from '../../src-tauri/src/error.rs?raw';
import libRs from '../../src-tauri/src/lib.rs?raw';
import menuRs from '../../src-tauri/src/menu.rs?raw';
import openFilesRs from '../../src-tauri/src/open_files.rs?raw';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  emit: vi.fn(),
  windowListen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  convertFileSrc: (p: string) => p,
  isTauri: () => true,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen, emit: mocks.emit }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ label: 'main', listen: mocks.windowListen }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }));
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-store', () => ({ load: vi.fn() }));

import { isNativeError, toNativeError } from './errors';
import type { MediaSessionBridge } from './mediaSession';
import { createTauriApi } from './tauri';
import { COMMANDS, EVENTS, MENU_ACTIONS, OPENABLE_EXTENSIONS } from './types';

/** `pub const NAME: &str = "value";` declarations of a Rust source file. */
function rustStrConsts(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/pub const (\w+): &str = "([^"]*)";/g)) out.set(m[1]!, m[2]!);
  return out;
}

/** The `ACTIONS` table of menu.rs as `{ id: { accelerator, native } }`. */
function rustMenuActions(): Record<string, { accelerator: string | null; native: boolean }> {
  const consts = rustStrConsts(menuRs);
  const start = menuRs.indexOf('pub const ACTIONS');
  const table = menuRs.slice(start, menuRs.indexOf('];', start));
  const entry = /(item|check)\(\s*([A-Z_]+|"[^"]+")\s*,\s*"[^"]*"\s*,\s*(?:(?:Some\("([^"]+)"\)|None)\s*,\s*)?(\w+)\s*,?\s*\)/g;
  const out: Record<string, { accelerator: string | null; native: boolean }> = {};
  for (const m of table.matchAll(entry)) {
    const raw = m[2]!;
    const id = raw.startsWith('"') ? raw.slice(1, -1) : (consts.get(raw) ?? `<unresolved ${raw}>`);
    out[id] = { accelerator: m[3] ?? null, native: m[4] === 'Native' };
  }
  return out;
}

type WindowHandler = (e: { payload: unknown }) => void;

/** A window-scoped `listen` that immediately delivers `payload` once. */
function deliverOnWindow(payload: unknown, unlisten = vi.fn()) {
  mocks.windowListen.mockImplementation((_event: string, handler: WindowHandler) => {
    handler({ payload });
    return Promise.resolve(unlisten);
  });
  return unlisten;
}

function fakeMediaBridge() {
  const bridge = {
    setEnabled: vi.fn((on: boolean) => on),
    setNowPlaying: vi.fn(() => true),
    onCommand: vi.fn(() => vi.fn()),
  };
  return bridge satisfies MediaSessionBridge;
}

describe('native system integration (menu, windows, tray, media keys, open files)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should mirror every menu.rs action id, accelerator and native route in MENU_ACTIONS', () => {
    // Arrange
    const rust = rustMenuActions();

    // Act
    const ts = Object.fromEntries(Object.entries(MENU_ACTIONS).map(([id, a]) => [id, { ...a }]));

    // Assert
    expect(Object.keys(rust)).toContain('transport.playPause');
    expect(ts).toEqual(rust);
  });

  it('should list exactly the commands registered in lib.rs', () => {
    // Arrange
    const start = libRs.indexOf('generate_handler![');
    const handler = libRs.slice(start, libRs.indexOf('])', start));

    // Act
    const registered = [...handler.matchAll(/commands::(\w+)/g)].map((m) => m[1]!).sort();

    // Assert
    expect(Object.values(COMMANDS).sort()).toEqual(registered);
  });

  it('should use the event names and extensions declared in the Rust sources', () => {
    // Arrange
    const extensions = /pub const EXTENSIONS: &\[&str\] = &\[([^\]]*)\]/.exec(openFilesRs)?.[1] ?? '';

    // Act
    const rustExtensions = [...extensions.matchAll(/"([^"]+)"/g)].map((x) => x[1]);

    // Assert
    expect(EVENTS.menuAction).toBe(rustStrConsts(menuRs).get('EVENT_MENU_ACTION'));
    expect(EVENTS.openFiles).toBe(rustStrConsts(openFilesRs).get('EVENT_OPEN_FILES'));
    expect(EVENTS.mediaCommand).toBe('media://command');
    expect([...OPENABLE_EXTENSIONS]).toEqual(rustExtensions);
  });

  it('should keep every Rust error code, including menu/window/tray/notification, as a NativeError code', () => {
    // Arrange
    const codes = [...errorRs.matchAll(/=> "(\w+)",/g)].map((m) => m[1]!);

    // Act
    const mapped = codes.map((code) => toNativeError({ code, message: 'x' }).code);

    // Assert
    expect(codes).toEqual(expect.arrayContaining(['menu', 'window', 'tray', 'notification']));
    expect(mapped).toEqual(codes);
  });

  it('should deliver menu actions from a window-scoped listener and unsubscribe', async () => {
    // Arrange
    const unlisten = deliverOnWindow({ id: 'file.openRecent', path: '/p/a.phyllo' });
    const onMenu = vi.fn();

    // Act
    const off = await createTauriApi().onMenuAction(onMenu);
    off();

    // Assert
    expect(mocks.windowListen).toHaveBeenCalledWith('menu://action', expect.any(Function));
    expect(mocks.listen).not.toHaveBeenCalled();
    expect(onMenu).toHaveBeenCalledWith({ id: 'file.openRecent', path: '/p/a.phyllo' });
    expect(unlisten).toHaveBeenCalled();
  });

  it('should deliver app://open-files payloads from a window-scoped listener', async () => {
    // Arrange
    deliverOnWindow({ paths: ['/p/a.phyllo', '/p/b.strudel'] });
    const onOpen = vi.fn();

    // Act
    await createTauriApi().onOpenFiles(onOpen);

    // Assert
    expect(mocks.windowListen).toHaveBeenCalledWith('app://open-files', expect.any(Function));
    expect(onOpen).toHaveBeenCalledWith({ paths: ['/p/a.phyllo', '/p/b.strudel'] });
  });

  it('should return the files buffered before JS listened', async () => {
    // Arrange
    mocks.invoke.mockResolvedValueOnce(['/p/a.phyllo']);

    // Act
    const files = await createTauriApi().takePendingOpenFiles();

    // Assert
    expect(files).toEqual(['/p/a.phyllo']);
    expect(mocks.invoke).toHaveBeenCalledWith('take_pending_open_files', undefined);
  });

  it('should broadcast a global event tagged with the sending window', async () => {
    // Arrange
    mocks.emit.mockResolvedValue(undefined);

    // Act
    await createTauriApi().broadcast('settings', { theme: 'dark' });

    // Assert
    expect(mocks.emit).toHaveBeenCalledWith('broadcast://settings', { source: 'main', payload: { theme: 'dark' } });
  });

  it('should hand other windows’ broadcasts to the callback and skip its own and malformed ones', async () => {
    // Arrange
    let handler: WindowHandler | undefined;
    mocks.listen.mockImplementation((_event: string, h: WindowHandler) => {
      handler = h;
      return Promise.resolve(() => undefined);
    });
    const cb = vi.fn();
    await createTauriApi().onBroadcast('settings', cb);

    // Act
    handler!({ payload: { source: 'main', payload: 'mine' } });
    handler!({ payload: { source: 'settings', payload: { theme: 'light' } } });
    handler!({ payload: 'not an envelope' });

    // Assert
    expect(mocks.listen).toHaveBeenCalledWith('broadcast://settings', expect.any(Function));
    expect(cb.mock.calls).toEqual([[{ theme: 'light' }]]);
  });

  it('should reject broadcast channel names that Tauri event names cannot carry', async () => {
    // Arrange
    const api = createTauriApi();

    // Act
    const sendErr = await api.broadcast('bad name!', 1).catch((e: unknown) => e);
    const listenErr = await api.onBroadcast('a/b', () => undefined).catch((e: unknown) => e);

    // Assert
    expect(isNativeError(sendErr, 'invalid_argument')).toBe(true);
    expect(isNativeError(listenErr, 'invalid_argument')).toBe(true);
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('should surface menu_set_state failures as NativeError with the Rust code', async () => {
    // Arrange
    mocks.invoke.mockRejectedValueOnce({ code: 'not_found', message: 'not found: menu item x' });

    // Act
    const err = await createTauriApi()
      .menuSetState({ id: 'file.save', enabled: false })
      .catch((e: unknown) => e);

    // Assert
    expect(isNativeError(err, 'not_found')).toBe(true);
  });

  it('should use native media keys when Rust registers them and keep the web media session off', async () => {
    // Arrange
    const web = fakeMediaBridge();
    const api = createTauriApi({ mediaSession: web });
    mocks.invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    const enabled = await api.mediaSetEnabled(true);
    const published = await api.mediaSetNowPlaying({ title: 'Groove', playing: true });

    // Assert
    expect(enabled).toBe(true);
    expect(published).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith('media_set_enabled', { enabled: true });
    expect(mocks.invoke).toHaveBeenCalledWith('media_set_now_playing', { info: { title: 'Groove', playing: true } });
    expect(web.setEnabled).toHaveBeenCalledWith(false);
    expect(web.setNowPlaying).not.toHaveBeenCalled();
  });

  it('should fall back to navigator.mediaSession where Rust has no media keys', async () => {
    // Arrange
    const web = fakeMediaBridge();
    const api = createTauriApi({ mediaSession: web });
    mocks.invoke.mockResolvedValueOnce(false);

    // Act
    const enabled = await api.mediaSetEnabled(true);
    await api.mediaSetNowPlaying({ title: 'Groove', playing: false });

    // Assert
    expect(enabled).toBe(true);
    expect(web.setEnabled).toHaveBeenCalledWith(true);
    expect(web.setNowPlaying).toHaveBeenCalledWith({ title: 'Groove', playing: false });
    expect(mocks.invoke).not.toHaveBeenCalledWith('media_set_now_playing', expect.anything());
  });

  it('should merge native media://command events with web media-session commands', async () => {
    // Arrange
    const offWeb = vi.fn();
    const web = fakeMediaBridge();
    web.onCommand.mockReturnValue(offWeb);
    const offNative = deliverOnWindow({ command: 'toggle' });
    const cb = vi.fn();

    // Act
    const off = await createTauriApi({ mediaSession: web }).onMediaCommand(cb);
    off();

    // Assert
    expect(mocks.windowListen).toHaveBeenCalledWith('media://command', expect.any(Function));
    expect(cb).toHaveBeenCalledWith({ command: 'toggle' });
    expect(web.onCommand).toHaveBeenCalledWith(cb);
    expect(offNative).toHaveBeenCalled();
    expect(offWeb).toHaveBeenCalled();
  });
});
