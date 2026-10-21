/**
 * Euclidean rhythms, matching Strudel's own `bd(k,n,r)` exactly.
 *
 * The algorithm is Strudel's Bjorklund (core/euclid.mjs:17-52, ported from Rohan Drape's hmt), and the rotation
 * follows Strudel's convention (euclid.mjs:130-136): `rotate(b, -r)`, i.e. a positive rotation moves the
 * pattern r steps *later* (`bd(3,8,2)` → hits on 0, 2, 5). This is the opposite of Tidal's convention.
 * No Strudel import here, so the Euclid tool can use it without loading the pattern engine.
 */

type Groups = number[][];

function bjorkStep(counts: [number, number], groups: [Groups, Groups]): Groups {
  const [ons, offs] = counts;
  const [xs, ys] = groups;
  if (Math.min(ons, offs) <= 1) return [...xs, ...ys];
  if (ons > offs) {
    // "left": pair the first `offs` on-groups with every off-group; the rest become the new remainder.
    const paired = xs.slice(0, offs).map((x, i) => x.concat(ys[i] ?? []));
    return bjorkStep([offs, ons - offs], [paired, xs.slice(offs)]);
  }
  // "right": pair every on-group with the first `ons` off-groups.
  const paired = xs.map((x, i) => x.concat(ys[i] ?? []));
  return bjorkStep([ons, offs - ons], [paired, ys.slice(ons)]);
}

/**
 * `hits` onsets spread as evenly as possible over `steps`, rotated by `rotation` (Strudel convention).
 * Negative `hits` inverts the pattern (as Strudel does); |hits| ≥ steps fills every step; steps < 1 → [].
 */
export function bjorklund(hits: number, steps: number, rotation = 0): boolean[] {
  const n = Math.floor(steps);
  if (!Number.isFinite(n) || n < 1) return [];
  const inverted = hits < 0;
  const ons = Math.min(Math.floor(Math.abs(hits)), n);
  const offs = n - ons;
  const ones: Groups = Array.from({ length: ons }, () => [1]);
  const zeros: Groups = Array.from({ length: offs }, () => [0]);
  let pattern = bjorkStep([ons, offs], [ones, zeros]).flat();
  if (inverted) pattern = pattern.map((x) => 1 - x);
  const r = Math.trunc(rotation);
  // Strudel: rotate(arr, -r) with rotate = (arr, k) => arr.slice(k).concat(arr.slice(0, k)); JS slice semantics kept verbatim.
  if (r) pattern = pattern.slice(-r).concat(pattern.slice(0, -r));
  return pattern.map((x) => x === 1);
}

/**
 * The step-grid row a Euclid rhythm writes: each of the `steps` Euclid steps spans `gridSteps / steps` grid
 * steps (n = 8 on a 16-step grid → every Euclid step is two sixteenths). Returns null when some hit doesn't
 * land on a grid step (e.g. `(3,5)` on 16 steps).
 */
export function euclidSteps(hits: number, steps: number, rotation = 0, gridSteps = 16): boolean[] | null {
  const pattern = bjorklund(hits, steps, rotation);
  if (pattern.length === 0) return null;
  const out = new Array<boolean>(gridSteps).fill(false);
  for (let i = 0; i < pattern.length; i++) {
    if (!pattern[i]) continue;
    const pos = (i * gridSteps) / pattern.length;
    if (!Number.isInteger(pos)) return null;
    out[pos] = true;
  }
  return out;
}
