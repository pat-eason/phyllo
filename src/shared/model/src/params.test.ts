import { describe, expect, it } from "vitest";
import {
  GUIDED_KNOBS,
  PARAM_ALIASES,
  PARAM_SPECS,
  PRO_KNOBS,
  canonicalParam,
  coerceParamValue,
  dbToGain,
  formatDb,
  formatNumber,
  gainToDb,
  isDefault,
  isOrbitName,
} from "./params";
import { PARAM_ORDER } from "./types";
import type { ParamName } from "./types";

describe("PARAM_SPECS", () => {
  it("has a spec for every ParamName, keyed by its own name", () => {
    for (const name of PARAM_ORDER) {
      expect(PARAM_SPECS[name].name).toBe(name);
      expect(PARAM_SPECS[name].code).toBe(`.${name}()`);
      expect(PARAM_SPECS[name].guidedLabel).not.toBe("");
      expect(PARAM_SPECS[name].description).not.toBe("");
    }
  });

  it("uses the real Strudel defaults and ranges", () => {
    expect(PARAM_SPECS.gain.default).toBe(0.8);
    expect(PARAM_SPECS.pan.default).toBe(0.5);
    expect(PARAM_SPECS.delayfeedback.default).toBe(0.5);
    expect(PARAM_SPECS.delay.default).toBe(0);
    expect(PARAM_SPECS.room.default).toBe(0);
    for (const unset of ["lpf", "lpq", "hpf", "roomsize", "delaytime"] as const) {
      expect(PARAM_SPECS[unset].default).toBeNull();
    }
    expect(PARAM_SPECS.lpq.max).toBe(50);
    expect(PARAM_SPECS.roomsize.max).toBe(10);
    expect(PARAM_SPECS.delayfeedback.max).toBe(0.98);
    expect(PARAM_SPECS.lpf.max).toBe(20000);
    expect(PARAM_SPECS.delaytime.unit).toBe("s");
  });

  it("maps every knob 0..1 monotonically and round-trips", () => {
    for (const name of PARAM_ORDER) {
      const spec = PARAM_SPECS[name];
      let prev = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const v = spec.fromKnob(i / 20);
        expect(v).toBeGreaterThanOrEqual(spec.min);
        expect(v).toBeLessThanOrEqual(spec.max);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
      // Round trip at a few positions (value precision limits the tolerance).
      for (const pos of [0, 0.25, 0.5, 0.75, 1]) {
        const back = spec.toKnob(spec.fromKnob(pos));
        const step = Math.abs(spec.toKnob(spec.fromKnob(pos) + 10 ** -spec.round) - back);
        expect(Math.abs(back - pos)).toBeLessThanOrEqual(step + 1e-9);
      }
    }
  });

  it("clamps knob input", () => {
    expect(PARAM_SPECS.lpf.fromKnob(-1)).toBe(200);
    expect(PARAM_SPECS.lpf.fromKnob(5)).toBe(8000);
    expect(PARAM_SPECS.gain.toKnob(5)).toBe(1);
    expect(PARAM_SPECS.gain.toKnob(-5)).toBe(0);
    expect(PARAM_SPECS.lpf.fromKnob(Number.NaN)).toBe(200);
  });

  it("shows the unset knob position for null/undefined", () => {
    expect(PARAM_SPECS.lpf.toKnob(null)).toBe(1);
    expect(PARAM_SPECS.hpf.toKnob(undefined)).toBe(0);
    expect(PARAM_SPECS.gain.toKnob(null)).toBe(0.8);
    expect(PARAM_SPECS.pan.toKnob(null)).toBe(0.5);
    expect(PARAM_SPECS.delayfeedback.toKnob(null)).toBeCloseTo(0.5102, 3);
  });
});

describe("knob value mapping (SPEC §6.1)", () => {
  it("lpf: 200 + v²·7800 Hz", () => {
    const lpf = PARAM_SPECS.lpf;
    expect(lpf.fromKnob(0)).toBe(200);
    expect(lpf.fromKnob(1)).toBe(8000);
    expect(lpf.fromKnob(0.42)).toBe(1576); // 200 + .1764·7800 = 1575.92
    expect(lpf.toKnob(1576)).toBeCloseTo(0.42, 3);
    expect(lpf.toKnob(8000)).toBe(1);
    expect(lpf.toKnob(100)).toBe(0);
  });

  it("lpf knob .42 reads 1.6k Hz; knob 1 reads 8.0k Hz; .85 reads 5.8k Hz", () => {
    const lpf = PARAM_SPECS.lpf;
    expect(lpf.format(lpf.fromKnob(0.42))).toBe("1.6k Hz");
    expect(lpf.format(lpf.fromKnob(1))).toBe("8.0k Hz");
    expect(lpf.format(lpf.fromKnob(0.85))).toBe("5.8k Hz");
    expect(lpf.format(lpf.fromKnob(0.1))).toBe("278 Hz");
  });

  it("lpq: 0–1 -> 0–20, roomsize 0–1 -> 0–10", () => {
    expect(PARAM_SPECS.lpq.fromKnob(0.5)).toBe(10);
    expect(PARAM_SPECS.lpq.fromKnob(1)).toBe(20);
    expect(PARAM_SPECS.lpq.toKnob(10)).toBe(0.5);
    expect(PARAM_SPECS.roomsize.fromKnob(0.4)).toBe(4);
    expect(PARAM_SPECS.roomsize.fromKnob(1)).toBe(10);
    expect(PARAM_SPECS.roomsize.format(4)).toBe("4.0");
    expect(PARAM_SPECS.lpq.format(10)).toBe("10");
  });

  it("gain / pan / shape / room / delay are linear 0–1", () => {
    for (const name of ["gain", "pan", "shape", "room", "delay"] as const) {
      expect(PARAM_SPECS[name].fromKnob(0.42)).toBe(0.42);
      expect(PARAM_SPECS[name].toKnob(0.42)).toBe(0.42);
    }
  });

  it("delaytime 0–1 s, delayfeedback 0–0.98", () => {
    expect(PARAM_SPECS.delaytime.fromKnob(0.125)).toBe(0.125);
    expect(PARAM_SPECS.delaytime.format(0.125)).toBe(".125 s");
    expect(PARAM_SPECS.delayfeedback.fromKnob(1)).toBe(0.98);
    expect(PARAM_SPECS.delayfeedback.toKnob(0.98)).toBe(1);
  });

  it("hpf: log 20 Hz–8 kHz", () => {
    const hpf = PARAM_SPECS.hpf;
    expect(hpf.fromKnob(0)).toBe(20);
    expect(hpf.fromKnob(1)).toBe(8000);
    expect(hpf.fromKnob(0.5)).toBe(400);
    expect(hpf.toKnob(400)).toBeCloseTo(0.5, 6);
    expect(hpf.toKnob(5)).toBe(0);
  });
});

describe("value text", () => {
  it("pan: C / L16 / R30", () => {
    const pan = PARAM_SPECS.pan;
    expect(pan.format(0.5)).toBe("C");
    expect(pan.format(0.495)).toBe("C");
    expect(pan.format(0.42)).toBe("L16");
    expect(pan.format(0.65)).toBe("R30");
    expect(pan.format(0)).toBe("L100");
    expect(pan.format(1)).toBe("R100");
    expect(pan.format(0.42, "guided")).toBe("Left 16");
    expect(pan.format(0.5, "guided")).toBe("Center");
    expect(pan.format(0.65, "guided")).toBe("Right 30");
  });

  it("gain and sends use code-style numbers", () => {
    expect(PARAM_SPECS.gain.format(0.78)).toBe(".78");
    expect(PARAM_SPECS.gain.format(1)).toBe("1");
    expect(PARAM_SPECS.gain.format(0)).toBe("0");
    expect(PARAM_SPECS.room.format(0.05)).toBe(".05");
    expect(PARAM_SPECS.shape.format(0.3)).toBe(".3");
    expect(formatNumber(-0.25)).toBe("-.25");
    expect(formatNumber(10, 1)).toBe("10");
  });

  it("describes unset values and patterned strings", () => {
    expect(PARAM_SPECS.lpf.format(null)).toBe("off");
    expect(PARAM_SPECS.lpq.format(undefined)).toBe("0");
    expect(PARAM_SPECS.gain.format(null)).toBe(".8");
    expect(PARAM_SPECS.pan.format(null)).toBe("C");
    expect(PARAM_SPECS.gain.format("[.45 .7]*4")).toBe("patterned");
  });
});

describe("knob sets", () => {
  it("Guided has 6 knobs and Pro 8, in SPEC order, all with specs", () => {
    expect(GUIDED_KNOBS).toEqual(["gain", "lpf", "room", "delay", "pan", "shape"]);
    expect(PRO_KNOBS).toEqual(["gain", "lpf", "lpq", "shape", "room", "roomsize", "delay", "pan"]);
    expect(GUIDED_KNOBS.map((n) => PARAM_SPECS[n].guidedLabel)).toEqual([
      "Volume",
      "Brightness",
      "Space",
      "Echo",
      "Pan",
      "Grit",
    ]);
  });
});

describe("aliases", () => {
  it.each([
    ["cutoff", "lpf"],
    ["ctf", "lpf"],
    ["lp", "lpf"],
    ["resonance", "lpq"],
    ["hcutoff", "hpf"],
    ["hp", "hpf"],
    ["size", "roomsize"],
    ["sz", "roomsize"],
    ["rsize", "roomsize"],
    ["delayfb", "delayfeedback"],
    ["dfb", "delayfeedback"],
    ["delayt", "delaytime"],
    ["dt", "delaytime"],
  ] as const)("%s -> %s", (alias, canonical) => {
    expect(canonicalParam(alias)).toBe(canonical);
    expect(PARAM_ALIASES[alias]).toBe(canonical);
  });

  it("canonical names map to themselves; everything else is null", () => {
    for (const name of PARAM_ORDER) expect(canonicalParam(name)).toBe(name);
    expect(canonicalParam("orbit")).toBeNull();
    expect(canonicalParam("o")).toBeNull();
    expect(canonicalParam("postgain")).toBeNull();
    expect(canonicalParam("toString")).toBeNull();
    expect(canonicalParam("__proto__")).toBeNull();
    expect(canonicalParam("")).toBeNull();
  });

  it("recognises orbit separately", () => {
    expect(isOrbitName("orbit")).toBe(true);
    expect(isOrbitName("o")).toBe(true);
    expect(isOrbitName("gain")).toBe(false);
  });
});

describe("isDefault / coerceParamValue", () => {
  it("compares against the Strudel default", () => {
    expect(isDefault("gain", 0.8)).toBe(true);
    expect(isDefault("gain", 0.81)).toBe(false);
    expect(isDefault("pan", 0.5)).toBe(true);
    expect(isDefault("room", 0)).toBe(true);
    expect(isDefault("delayfeedback", 0.5)).toBe(true);
    expect(isDefault("lpf", 8000)).toBe(false); // no default: any number is explicit
    expect(isDefault("lpf", null)).toBe(true);
    expect(isDefault("lpf", undefined)).toBe(true);
    expect(isDefault("gain", "[.45 .7]*4")).toBe(false);
  });

  it("clamps, rounds, and nulls defaults", () => {
    expect(coerceParamValue("gain", 9)).toBe(2);
    expect(coerceParamValue("gain", 0.8)).toBe(null);
    expect(coerceParamValue("gain", 0.123456)).toBe(0.123);
    expect(coerceParamValue("lpf", 25000)).toBe(20000);
    expect(coerceParamValue("lpf", 1575.92)).toBe(1576);
    expect(coerceParamValue("pan", -1)).toBe(0);
    expect(coerceParamValue("room", 0)).toBe(null);
    expect(coerceParamValue("room", null)).toBe(null);
    expect(coerceParamValue("room", "")).toBe(null);
    expect(coerceParamValue("gain", " [.45 .7]*4 ")).toBe("[.45 .7]*4");
    expect(coerceParamValue("gain", Number.NaN)).toBeUndefined();
    expect(coerceParamValue("gain", Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe("gain <-> dB", () => {
  it("dB = 20·log10(gain)", () => {
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0.5)).toBeCloseTo(-6.0206, 3);
    expect(gainToDb(0.8)).toBeCloseTo(-1.9382, 3);
    expect(gainToDb(2)).toBeCloseTo(6.0206, 3);
  });

  it("handles silence", () => {
    expect(gainToDb(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(gainToDb(-1)).toBe(Number.NEGATIVE_INFINITY);
    expect(dbToGain(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(dbToGain(Number.NaN)).toBe(0);
  });

  it("round-trips across the fader scale (+6…−48)", () => {
    for (const db of [6, 0, -6, -12, -24, -48]) {
      expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 9);
    }
    expect(dbToGain(0)).toBe(1);
  });

  it("formats readouts", () => {
    expect(formatDb(0)).toBe("0.0 dB");
    expect(formatDb(-6.0206)).toBe("−6.0 dB");
    expect(formatDb(3)).toBe("+3.0 dB");
    expect(formatDb(Number.NEGATIVE_INFINITY)).toBe("−∞ dB");
  });
});

describe("types", () => {
  it("PARAM_SPECS covers the same names as PARAM_ORDER", () => {
    const names = Object.keys(PARAM_SPECS).sort();
    expect(names).toEqual([...PARAM_ORDER].sort() as ParamName[]);
  });
});
