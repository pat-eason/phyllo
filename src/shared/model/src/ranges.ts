/** Internal helpers for 1-based, inclusive bar ranges (clips, sections). Not part of the public barrel. */

export interface BarRange {
  id: string;
  startBar: number;
  endBar: number;
}

export function clampInt(n: number, min: number, max: number): number {
  const v = Math.round(n);
  return Math.min(max, Math.max(min, v));
}

/** Round to integers, clamp into `1..lengthBars`, and make sure `endBar >= startBar`. */
export function clampRange<T extends BarRange>(item: T, lengthBars: number): T {
  const startBar = clampInt(item.startBar, 1, lengthBars);
  const endBar = clampInt(item.endBar, startBar, lengthBars);
  if (startBar === item.startBar && endBar === item.endBar) return item;
  return { ...item, startBar, endBar };
}

export function sortRanges<T extends BarRange>(items: readonly T[]): T[] {
  return items.slice().sort((a, b) => a.startBar - b.startBar || a.endBar - b.endBar);
}

function uniqueDerivedId(base: string, taken: Set<string>): string {
  let n = 2;
  let id = `${base}~${n}`;
  while (taken.has(id)) id = `${base}~${++n}`;
  taken.add(id);
  return id;
}

/**
 * Insert `winner` into `others`, trimming whatever it overlaps ("the item being placed wins"):
 * an overlapped neighbour loses the covered bars; one fully covered is removed; one that strictly
 * contains the winner is split in two (the left part keeps its id, the right part gets a derived
 * `<id>~2` id so the result stays deterministic and pure). Result is sorted by `startBar`.
 */
export function placeRange<T extends BarRange>(others: readonly T[], winner: T): T[] {
  const taken = new Set<string>([winner.id, ...others.map((o) => o.id)]);
  const out: T[] = [];
  for (const o of others) {
    if (o.endBar < winner.startBar || o.startBar > winner.endBar) {
      out.push(o);
      continue;
    }
    const hasLeft = o.startBar < winner.startBar;
    const hasRight = o.endBar > winner.endBar;
    if (hasLeft) out.push({ ...o, endBar: winner.startBar - 1 });
    if (hasRight) {
      out.push({
        ...o,
        id: hasLeft ? uniqueDerivedId(o.id, taken) : o.id,
        startBar: winner.endBar + 1,
      });
    }
  }
  out.push(winner);
  return sortRanges(out);
}

/**
 * Make an arbitrary list valid: clamp every item into the song, sort, and push the start of any item
 * that overlaps its predecessor past the predecessor's end (dropping items left empty). Returns the
 * input array itself when nothing needed fixing.
 */
export function sanitizeRanges<T extends BarRange>(items: readonly T[], lengthBars: number): T[] {
  const sorted = sortRanges(items.map((i) => clampRange(i, lengthBars)));
  const out: T[] = [];
  let prevEnd = 0;
  for (const item of sorted) {
    if (item.startBar > prevEnd) {
      out.push(item);
      prevEnd = item.endBar;
    } else if (item.endBar > prevEnd) {
      out.push({ ...item, startBar: prevEnd + 1 });
      prevEnd = item.endBar;
    }
  }
  const unchanged = out.length === items.length && out.every((o, i) => o === items[i]);
  return unchanged ? (items as T[]) : out;
}

/** Drop ranges that start after `lengthBars`, and cut the end of those that run past it. */
export function trimRangesToLength<T extends BarRange>(items: readonly T[], lengthBars: number): T[] {
  const out: T[] = [];
  let changed = false;
  for (const item of items) {
    if (item.startBar > lengthBars) {
      changed = true;
      continue;
    }
    if (item.endBar > lengthBars) {
      changed = true;
      out.push({ ...item, endBar: lengthBars });
    } else {
      out.push(item);
    }
  }
  return changed ? out : (items as T[]);
}
