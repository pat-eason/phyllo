import { LogicalPosition } from '@tauri-apps/api/dpi';
import { Image } from '@tauri-apps/api/image';
import { Menu } from '@tauri-apps/api/menu';
import type {
  CheckMenuItemOptions,
  IconMenuItemOptions,
  MenuItemOptions,
  PredefinedMenuItemOptions,
  SubmenuOptions,
} from '@tauri-apps/api/menu';
import type { MenuEntry } from '@phyllo/ui';

import { toNativeError } from './errors';

/**
 * Ids of popup items. The global `on_menu_event` handler in `src-tauri/src/lib.rs` also sees popup clicks and runs any
 * id found in the menu-bar `ACTIONS` table, so popup ids must never collide with those: a `ctx:` prefix keeps them
 * apart and each item's own `action` callback runs instead.
 */
export const CONTEXT_MENU_ID_PREFIX = 'ctx:';

type NativeItem = MenuItemOptions | CheckMenuItemOptions | IconMenuItemOptions | SubmenuOptions | PredefinedMenuItemOptions;

const SWATCH_PX = 32;

/** Parse `#rgb` / `#rrggbb`; anything else is grey. */
function rgb(color: string): [number, number, number] {
  const hex = color.trim().replace(/^#/, '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const value = /^[0-9a-f]{6}$/i.test(full) ? Number.parseInt(full, 16) : 0x888888;
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** A filled, anti-aliased circle as raw RGBA (no PNG decoding, so no extra Cargo features). */
export function swatchPixels(color: string, size = SWATCH_PX): Uint8Array {
  const [r, g, b] = rgb(color);
  const pixels = new Uint8Array(size * size * 4);
  const radius = size / 2 - 1;
  const centre = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      const alpha = Math.max(0, Math.min(1, radius - distance + 0.5));
      const offset = (y * size + x) * 4;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

export interface NativeContextMenu {
  popup(entries: MenuEntry[], at: { x: number; y: number }): Promise<void>;
}

/**
 * Native (OS-drawn) context menus from `MenuEntry` data. Notes:
 * - On macOS the popup runs a modal tracking loop, so `popup` resolves only once the menu has closed; the chosen
 *   item's `action` arrives through its channel around the same time. The menu object is therefore kept until the
 *   next popup and released then, never straight after `popup`, so a late action is not lost.
 * - `destructive` and `title` have no native equivalent. An item with a `swatch` becomes an icon item and its
 *   `checked` state is not shown (muda has no checked icon item).
 */
export function createNativeContextMenu(): NativeContextMenu {
  let previous: Menu | null = null;
  let sequence = 0;
  const swatches = new Map<string, Promise<Image>>();

  function swatch(color: string): Promise<Image> {
    let image = swatches.get(color);
    if (!image) {
      image = Image.new(swatchPixels(color), SWATCH_PX, SWATCH_PX);
      swatches.set(color, image);
      // A failed image must not poison later menus.
      image.catch(() => swatches.delete(color));
    }
    return image;
  }

  async function toItems(entries: MenuEntry[], prefix: string): Promise<NativeItem[]> {
    return Promise.all(
      entries.map(async (entry): Promise<NativeItem> => {
        if (entry.type === 'separator') return { item: 'Separator' };
        const id = `${prefix}${entry.id}`;
        if (entry.type === 'submenu') {
          return { id, text: entry.label, enabled: !entry.disabled, items: await toItems(entry.items, `${id}/`) };
        }
        const base: MenuItemOptions = {
          id,
          text: entry.label,
          enabled: !entry.disabled,
          action: () => entry.onSelect(),
          ...(entry.accelerator ? { accelerator: entry.accelerator } : {}),
        };
        if (entry.swatch) return { ...base, icon: await swatch(entry.swatch) };
        if (entry.checked !== undefined) return { ...base, checked: entry.checked };
        return base;
      }),
    );
  }

  return {
    async popup(entries, at) {
      sequence += 1;
      try {
        const menu = await Menu.new({ items: await toItems(entries, `${CONTEXT_MENU_ID_PREFIX}${sequence}:`) });
        const stale = previous;
        previous = menu;
        if (stale) void stale.close().catch(() => undefined);
        await menu.popup(new LogicalPosition(at.x, at.y));
      } catch (err) {
        throw toNativeError(err);
      }
    },
  };
}
