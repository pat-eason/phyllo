import { describe, expect, it } from "vitest";
import { MAX_VIOLATIONS, parseCsp, recordCspViolations } from "./csp";

function violation(init: Partial<SecurityPolicyViolationEvent>): Event {
  return Object.assign(new Event("securitypolicyviolation"), init);
}

describe("self-test CSP probes", () => {
  it("should record violations with their directive and blocked URI", () => {
    // Arrange
    const target = new EventTarget();
    const recorder = recordCspViolations(target);

    // Act
    target.dispatchEvent(violation({ effectiveDirective: "connect-src", blockedURI: "https://evil.example/x", sourceFile: "tauri://localhost/assets/index.js", lineNumber: 3, disposition: "enforce" }));
    target.dispatchEvent(violation({ violatedDirective: "img-src", blockedURI: "data" }));

    // Assert
    expect(recorder.violations).toEqual([
      { directive: "connect-src", blockedURI: "https://evil.example/x", sourceFile: "tauri://localhost/assets/index.js", line: 3, disposition: "enforce", expected: false },
      { directive: "img-src", blockedURI: "data", sourceFile: "", line: 0, disposition: "", expected: false },
    ]);
  });

  it("should mark violations raised inside expect() as expected", async () => {
    const target = new EventTarget();
    const recorder = recordCspViolations(target);

    await recorder.expect(() => {
      target.dispatchEvent(violation({ effectiveDirective: "script-src-elem" }));
    }, 0);
    target.dispatchEvent(violation({ effectiveDirective: "style-src" }));

    expect(recorder.violations.map((v) => [v.directive, v.expected])).toEqual([
      ["script-src-elem", true],
      ["style-src", false],
    ]);
  });

  it("should stop recording after stop() and cap the list", () => {
    const target = new EventTarget();
    const recorder = recordCspViolations(target);

    for (let i = 0; i < MAX_VIOLATIONS + 5; i++) target.dispatchEvent(violation({ effectiveDirective: "img-src" }));
    recorder.stop();
    target.dispatchEvent(violation({ effectiveDirective: "font-src" }));

    expect(recorder.violations).toHaveLength(MAX_VIOLATIONS);
    expect(recorder.violations.some((v) => v.directive === "font-src")).toBe(false);
  });

  it("should parse a serialized policy into directives", () => {
    expect(parseCsp("default-src 'self'; script-src 'self' 'unsafe-eval' ;; Connect-Src ipc: asset:")).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-eval'"],
      "connect-src": ["ipc:", "asset:"],
    });
  });
});
