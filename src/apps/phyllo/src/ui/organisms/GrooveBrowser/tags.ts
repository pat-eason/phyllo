/** Tag helpers: names compare case-insensitively (the library filter does the same), first spelling wins. */

export function cleanTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function hasTag(tags: readonly string[], tag: string): boolean {
  return tags.some((t) => sameTag(t, tag));
}

/** `existing` followed by the `added` tags it doesn't have yet. */
export function unionTags(existing: readonly string[], added: readonly string[]): string[] {
  const out = [...existing];
  for (const raw of added) {
    const tag = cleanTag(raw);
    if (tag !== "" && !hasTag(out, tag)) out.push(tag);
  }
  return out;
}

/** Rename (`to` is a name), merge (`to` is another tag) or delete (`to` is null) `from` in one tag list. */
export function replaceTag(tags: readonly string[], from: string, to: string | null): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const next = sameTag(tag, from) ? to : tag;
    if (next !== null && !hasTag(out, next)) out.push(next);
  }
  return out;
}

/** Splits typed text on commas: "lo-fi, night" gives two tags. */
export function parseTagInput(text: string): string[] {
  return text
    .split(",")
    .map(cleanTag)
    .filter((t) => t !== "");
}
