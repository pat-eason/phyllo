/** Generates the unique part of an id. Receives the prefix so test generators can number per prefix. */
export type IdGenerator = (prefix: string) => string;

let generator: IdGenerator | null = null;

/** Override id generation (tests). Pass `null` to restore random ids. */
export function setIdGenerator(fn: IdGenerator | null): void {
  generator = fn;
}

/** A generator producing `<prefix>1`, `<prefix>2`, … with one counter per prefix. For deterministic tests. */
export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}${next}`;
  };
}

function randomToken(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "").slice(0, 12);
  let out = "";
  while (out.length < 12) out += Math.floor(Math.random() * 36).toString(36);
  return out;
}

/** New id: `prefix` + 12 random hex chars (or the injected generator's output). */
export function newId(prefix = ""): string {
  return generator ? generator(prefix) : prefix + randomToken();
}
