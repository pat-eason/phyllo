/**
 * strudel.cc share links (DECISIONS V13, REPORT (d)): `https://strudel.cc/#` + encodeURIComponent(base64(UTF-8)).
 * Byte-compatible with @strudel/core 1.2.6 util.mjs `code2hash`/`hash2code`, but chunked so large programs
 * don't overflow the call stack the way upstream's `String.fromCharCode(...bytes)` does.
 */

export const STRUDEL_ORIGIN = "https://strudel.cc/";

export function code2hash(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return encodeURIComponent(btoa(bin));
}

/** Inverse of `code2hash`. Throws on malformed base64; invalid UTF-8 decodes to U+FFFD (same as upstream). */
export function hash2code(hash: string): string {
  const bin = atob(decodeURIComponent(hash));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function toShareUrl(code: string, origin: string = STRUDEL_ORIGIN): string {
  return `${origin}#${code2hash(code)}`;
}

/**
 * Decode a strudel.cc link. `#<base64>` links carry the code; `?<id>` short links live in strudel.cc's
 * database and can't be decoded offline, so they return `{ shortId }` for the UI to explain. Null for
 * anything else, including a malformed hash.
 */
export function fromShareUrl(url: string): { code: string } | { shortId: string } | null {
  const trimmed = url.trim();
  const hashAt = trimmed.indexOf("#");
  const frag = hashAt >= 0 ? trimmed.slice(hashAt + 1) : "";
  if (frag) {
    try {
      return { code: hash2code(frag) };
    } catch {
      return null;
    }
  }
  const query = trimmed.split("?")[1]?.split("#")[0]?.split("&")[0];
  return query ? { shortId: query } : null;
}
