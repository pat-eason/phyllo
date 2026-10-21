// strudel.cc share-link codec, byte-compatible with @strudel/core 1.2.6 util.mjs code2hash/hash2code
// (UTF-8 -> base64 (standard alphabet, '=' padded) -> encodeURIComponent). Chunked to avoid
// the call-stack limit that `String.fromCharCode(...bytes)` hits on large programs.
export function code2hash(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return encodeURIComponent(btoa(bin));
}

export function hash2code(hash: string): string {
  const bin = atob(decodeURIComponent(hash));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes); // non-fatal: invalid UTF-8 -> U+FFFD (same as upstream)
}

export const toShareUrl = (code: string, origin = 'https://strudel.cc/') => `${origin}#${code2hash(code)}`;

/** Accepts a full strudel.cc URL. Returns code for `#<base64>` links; `?<id>` short links live in
 *  strudel.cc's Supabase table (code_v1) and cannot be decoded offline -> returns { shortId }. */
export function fromShareUrl(url: string): { code: string } | { shortId: string } | null {
  const frag = url.split('#')[1];
  if (frag) return { code: hash2code(frag) };
  const q = url.split('?')[1]?.split('#')[0]?.split('&')[0];
  return q ? { shortId: q } : null;
}
