/**
 * Content-Security-Policy probes for the self-test (V18, F9): which policy the web view actually got (Tauri sends it
 * as a response header on the HTML, plus any `<meta http-equiv>`), whether it is enforced, and every
 * `securitypolicyviolation` the app caused. Recording starts when this module is imported (`./index.ts`, before the
 * app renders) so boot-time violations count too; it keeps at most `MAX_VIOLATIONS` entries.
 */
import { errorText } from "./report";
import type { Detail } from "./report";

export const MAX_VIOLATIONS = 50;

export interface CspViolation {
  /** `effectiveDirective` (falls back to `violatedDirective`). */
  directive: string;
  blockedURI: string;
  sourceFile: string;
  line: number;
  disposition: string;
  /** Raised by `probeCspEnforced` on purpose (not a problem). */
  expected: boolean;
}

export interface CspRecorder {
  readonly violations: readonly CspViolation[];
  /** Violations raised while `fn` runs (and `settleMs` after it) are marked `expected`. */
  expect<T>(fn: () => T | Promise<T>, settleMs?: number): Promise<T>;
  stop(): void;
}

const clip = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max)}…` : text);

export function recordCspViolations(target: Pick<EventTarget, "addEventListener" | "removeEventListener"> = document): CspRecorder {
  const violations: CspViolation[] = [];
  let expecting = 0;
  const onViolation = (event: Event) => {
    if (violations.length >= MAX_VIOLATIONS) return;
    const e = event as Partial<SecurityPolicyViolationEvent>;
    violations.push({
      directive: e.effectiveDirective || e.violatedDirective || "",
      blockedURI: clip(e.blockedURI ?? ""),
      sourceFile: clip(e.sourceFile ?? ""),
      line: e.lineNumber ?? 0,
      disposition: e.disposition ?? "",
      expected: expecting > 0,
    });
  };
  target.addEventListener("securitypolicyviolation", onViolation);
  return {
    violations,
    async expect(fn, settleMs = 300) {
      expecting++;
      try {
        const result = await fn();
        await new Promise((resolve) => setTimeout(resolve, settleMs)); // violation events are dispatched as tasks
        return result;
      } finally {
        expecting--;
      }
    },
    stop: () => target.removeEventListener("securitypolicyviolation", onViolation),
  };
}

/** The policy the document was served with: the HTML response's header (re-fetched) and any meta tags. */
export async function activeCsp(): Promise<{ header: string | null; meta: string[]; headerError?: string }> {
  const meta = [...document.querySelectorAll("meta[http-equiv]")]
    .filter((m) => m.getAttribute("http-equiv")?.toLowerCase() === "content-security-policy")
    .map((m) => m.getAttribute("content") ?? "");
  try {
    const response = await fetch(window.location.href.split("#")[0] ?? "/", { cache: "no-store" });
    return { header: response.headers.get("content-security-policy"), meta };
  } catch (error) {
    return { header: null, meta, headerError: errorText(error) };
  }
}

/** Directive → sources of a serialized policy (`a b; c d` → `{ a: ["b"], c: ["d"] }`). */
export function parseCsp(policy: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = sources;
  }
  return out;
}

/** True when an inline `<script>` is refused (the policy is enforced, not report-only or missing). */
export async function probeCspEnforced(recorder: CspRecorder): Promise<Detail> {
  const flag = "__phylloCspProbe";
  const w = window as unknown as Record<string, unknown>;
  delete w[flag];
  try {
    await recorder.expect(() => {
      const script = document.createElement("script");
      script.textContent = `window.${flag} = 1;`;
      document.head.append(script);
      script.remove();
    });
    let evalAllowed: boolean | string;
    try {
      evalAllowed = (0, eval)("1 + 1") === 2 && new Function("return 2")() === 2; // Strudel needs both
    } catch (error) {
      evalAllowed = errorText(error);
    }
    return { inlineScriptBlocked: w[flag] === undefined, evalAllowed };
  } catch (error) {
    return { inlineScriptBlocked: false, error: errorText(error) };
  } finally {
    delete w[flag];
  }
}
