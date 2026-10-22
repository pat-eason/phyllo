import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  menuNew: vi.fn(),
  popup: vi.fn(),
  close: vi.fn(),
  imageNew: vi.fn(),
}));

vi.mock('@tauri-apps/api/menu', () => ({ Menu: { new: mocks.menuNew } }));
vi.mock('@tauri-apps/api/image', () => ({ Image: { new: mocks.imageNew } }));
vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

import type { MenuEntry } from '@phyllo/ui';

import { CONTEXT_MENU_ID_PREFIX, createNativeContextMenu, swatchPixels } from './contextMenu';

interface BuiltItem {
  id?: string;
  text?: string;
  item?: string;
  enabled?: boolean;
  checked?: boolean;
  accelerator?: string;
  icon?: unknown;
  action?: (id: string) => void;
  items?: BuiltItem[];
}

function builtItems(call = 0): BuiltItem[] {
  return (mocks.menuNew.mock.calls[call]?.[0] as { items: BuiltItem[] }).items;
}

const SWATCH = { kind: 'image' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.menuNew.mockImplementation(async () => ({ popup: mocks.popup, close: mocks.close }));
  mocks.popup.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.imageNew.mockResolvedValue(SWATCH);
});

function trackEntries(onRename = vi.fn(), onGreen = vi.fn()): MenuEntry[] {
  return [
    { id: 'rename', label: 'Rename', accelerator: 'F2', onSelect: onRename },
    { id: 'mute', label: 'Mute', checked: true, onSelect: () => undefined },
    { type: 'separator' },
    { type: 'submenu', id: 'color', label: 'Colour', items: [{ id: 'green', label: 'Green', swatch: '#7FD98A', onSelect: onGreen }] },
    { id: 'paste', label: 'Paste', disabled: true, onSelect: () => undefined },
  ];
}

describe('native context menu', () => {
  it('should build native items with prefixed ids so the menu-bar handler ignores them', async () => {
    // Arrange
    const menu = createNativeContextMenu();

    // Act
    await menu.popup(trackEntries(), { x: 10, y: 20 });

    // Assert
    const items = builtItems();
    expect(items.map((item) => item.text ?? item.item)).toEqual(['Rename', 'Mute', 'Separator', 'Colour', 'Paste']);
    for (const item of items.filter((candidate) => candidate.id)) expect(item.id?.startsWith(CONTEXT_MENU_ID_PREFIX)).toBe(true);
    expect(items[0]).toMatchObject({ accelerator: 'F2', enabled: true });
    expect(items[1]).toMatchObject({ checked: true });
    expect(items[4]).toMatchObject({ enabled: false });
  });

  it('should give swatch items a generated colour icon inside submenus', async () => {
    // Arrange
    const menu = createNativeContextMenu();

    // Act
    await menu.popup(trackEntries(), { x: 0, y: 0 });

    // Assert
    expect(builtItems()[3]?.items?.[0]).toMatchObject({ text: 'Green', icon: SWATCH });
    expect(mocks.imageNew).toHaveBeenCalledWith(expect.any(Uint8Array), 32, 32);
  });

  it("should run the entry's onSelect when its native item is chosen", async () => {
    // Arrange
    const onRename = vi.fn();
    const onGreen = vi.fn();
    const menu = createNativeContextMenu();
    await menu.popup(trackEntries(onRename, onGreen), { x: 0, y: 0 });

    // Act
    builtItems()[0]?.action?.('x');
    builtItems()[3]?.items?.[0]?.action?.('y');

    // Assert
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onGreen).toHaveBeenCalledTimes(1);
  });

  it('should pop up at the given logical position', async () => {
    // Arrange
    const menu = createNativeContextMenu();

    // Act
    await menu.popup(trackEntries(), { x: 12, y: 34 });

    // Assert
    expect(mocks.popup).toHaveBeenCalledWith(expect.objectContaining({ x: 12, y: 34 }));
  });

  it('should keep a shown menu alive so a late item action still arrives', async () => {
    // Arrange
    const menu = createNativeContextMenu();

    // Act
    await menu.popup(trackEntries(), { x: 0, y: 0 });

    // Assert
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('should release the previous menu when the next one opens', async () => {
    // Arrange
    const menu = createNativeContextMenu();
    await menu.popup(trackEntries(), { x: 0, y: 0 });

    // Act
    await menu.popup(trackEntries(), { x: 0, y: 0 });

    // Assert
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('should reject with a NativeError when the menu cannot be built', async () => {
    // Arrange
    mocks.menuNew.mockRejectedValue('menu plugin denied');
    const menu = createNativeContextMenu();

    // Act / Assert
    await expect(menu.popup(trackEntries(), { x: 0, y: 0 })).rejects.toMatchObject({ name: 'NativeError' });
  });

  it('should draw an opaque centre and a transparent corner in a swatch', () => {
    // Arrange / Act
    const pixels = swatchPixels('#ff0000', 8);

    // Assert
    const centre = (4 * 8 + 4) * 4;
    expect(Array.from(pixels.slice(centre, centre + 4))).toEqual([255, 0, 0, 255]);
    expect(pixels[3]).toBe(0);
  });
});
