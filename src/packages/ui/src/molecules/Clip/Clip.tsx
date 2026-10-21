import {
  forwardRef,
  memo,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "../../atoms/Icon";
import styles from "./Clip.module.css";

/**
 * What the clip draws for one cycle, computed by the engine once per pattern change (`clipViz` in
 * `@phyllo/engine`). `t` / `d` are 0–1 within the cycle and `pitch` is 0–1 (1 = highest).
 */
export type ClipViz =
  | { kind: "drum"; ticks: number[] }
  | { kind: "melodic"; notes: { t: number; d: number; pitch: number }[] }
  | { kind: "chord"; chords: { t: number; d: number; pitches: number[] }[] }
  | { kind: "sample"; peaks?: number[] }
  | { kind: "code" };

export type ClipKind = ClipViz["kind"];
export type ClipEdge = "start" | "end";

export interface ClipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "children"> {
  /** Track name, used in the accessible name ("Bass, bars 9 to 16, <c2 eb2 g2 bb1>*2"). */
  name: string;
  /** 1-based, inclusive. The lane positions the clip (left / width); the molecule only uses the count. */
  startBar: number;
  endBar: number;
  /** Track color (one of `--ph-track-*` or a hex). Ink on top is always `--ph-clip-ink`. */
  color: string;
  /** The track's mini-notation. */
  label: string;
  /**
   * One cycle, repeated across the clip's bars; or one entry per bar (cycled when shorter) so `<a b>`
   * patterns can differ bar to bar. All entries share the first entry's kind.
   */
  viz: ClipViz | readonly ClipViz[];
  /** The clip's track is selected: 2 px `--ph-text` ring. */
  selected?: boolean;
  /** False when muted or not soloed: 32% opacity. Default true. */
  audible?: boolean;
  /** Being moved or resized by the Timeline: lifted look and grabbing cursor. */
  dragging?: boolean;
  /** Pointer-down on the left or right edge handle. The Timeline does the layout math. */
  onResizeStart?: (edge: ClipEdge, event: ReactPointerEvent<HTMLElement>) => void;
  /** Pointer-down on the clip body (not on a handle). */
  onMoveStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
const f = (v: number) => Number(v.toFixed(4));

/** Melodic/chord dash y: pitch 1 sits near the top of the content area, 0 near the bottom. */
const pitchY = (p: number) => f(0.12 + (1 - clamp01(p)) * 0.76);

/** Deterministic stand-in envelope (24 points per cycle) when the engine has no peaks yet. */
const PLACEHOLDER_PEAKS = Array.from({ length: 24 }, (_, i) => {
  const env = Math.max(0.18, 1 - (i % 9) / 9);
  return (0.3 + 0.7 * Math.abs(Math.sin(i * 1.9) * Math.cos(i * 0.41))) * env;
});

type Dash = { t: number; d: number; pitch: number };

function dashPath(items: readonly Dash[], offset: number): string {
  let d = "";
  for (const n of items) {
    const x1 = offset + clamp01(n.t);
    const x2 = x1 + Math.max(0.004, clamp01(n.d) * 0.85);
    d += `M${f(x1)} ${pitchY(n.pitch)}H${f(x2)}`;
  }
  return d;
}

/** Draws one cycle at `offset` (cycle units) into the shared path / polygon buffers. */
function drawCycle(viz: ClipViz, offset: number, out: { path: string; up: string[]; down: string[] }) {
  switch (viz.kind) {
    case "drum":
      for (const t of viz.ticks) out.path += `M${f(offset + clamp01(t))} 0V1`;
      return;
    case "melodic":
      out.path += dashPath(viz.notes, offset);
      return;
    case "chord":
      out.path += dashPath(
        viz.chords.flatMap((ch) => ch.pitches.map((pitch) => ({ t: ch.t, d: ch.d, pitch }))),
        offset,
      );
      return;
    case "sample": {
      const peaks = viz.peaks && viz.peaks.length > 1 ? viz.peaks : PLACEHOLDER_PEAKS;
      peaks.forEach((p, i) => {
        const x = f(offset + i / (peaks.length - 1));
        const a = clamp01(p) * 0.48;
        out.up.push(`${x},${f(0.5 - a)}`);
        out.down.unshift(`${x},${f(0.5 + a)}`);
      });
      return;
    }
    case "code":
      return;
    default: {
      const never: never = viz;
      return never;
    }
  }
}

function toCycles(viz: ClipViz | readonly ClipViz[]): readonly ClipViz[] {
  return Array.isArray(viz) ? viz : [viz as ClipViz];
}

/** One `<svg>` per clip; geometry in cycle units (`viewBox 0 0 bars 1`), strokes kept in screen px. */
function Viz({ viz: input, bars }: { viz: ClipViz | readonly ClipViz[]; bars: number }) {
  const cycles = toCycles(input);
  const first = cycles[0];
  if (!first || first.kind === "code") return null;
  const out = { path: "", up: [] as string[], down: [] as string[] };
  for (let c = 0; c < bars; c++) {
    const viz = cycles[c % cycles.length];
    if (viz && viz.kind === first.kind) drawCycle(viz, c, out);
  }
  return (
    <svg
      className={styles["viz"]}
      data-viz={first.kind}
      viewBox={`0 0 ${bars} 1`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {first.kind === "sample" ? (
        <polygon className={styles["wave"]} points={[...out.up, ...out.down].join(" ")} />
      ) : (
        <path className={first.kind === "drum" ? styles["ticks"] : styles["notes"]} d={out.path} />
      )}
    </svg>
  );
}

const MemoViz = memo(Viz);

/**
 * A span of bars on a Timeline lane, in the track color, labelled with the track's mini-notation and a
 * small picture of what plays. A focusable `<button>`; move / resize / keyboard nudging belong to the
 * Timeline, which gets the pointer-downs through `onMoveStart` / `onResizeStart`.
 */
const ClipImpl = forwardRef<HTMLButtonElement, ClipProps>(function Clip(
  {
    name,
    startBar,
    endBar,
    color,
    label,
    viz,
    selected = false,
    audible = true,
    dragging = false,
    onResizeStart,
    onMoveStart,
    className,
    style,
    type = "button",
    onPointerDown,
    "aria-label": ariaLabel,
    ...rest
  },
  ref,
) {
  const bars = Math.max(1, Math.round(endBar - startBar + 1));
  const kind: ClipKind = toCycles(viz)[0]?.kind ?? "code";
  const classes = [styles["clip"], className].filter(Boolean).join(" ");
  const rootStyle = { ...style, "--clip-color": color } as CSSProperties;

  const handle = (edge: ClipEdge) =>
    onResizeStart ? (
      <span
        className={styles["handle"]}
        data-edge={edge}
        aria-hidden="true"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onResizeStart(edge, e);
        }}
      />
    ) : null;

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      style={rootStyle}
      aria-label={ariaLabel ?? `${name}, bars ${startBar} to ${endBar}, ${label}${audible ? "" : ", muted"}`}
      data-kind={kind}
      data-selected={selected ? "" : undefined}
      data-inaudible={audible ? undefined : ""}
      data-dragging={dragging ? "" : undefined}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        if (!e.defaultPrevented && e.button === 0) onMoveStart?.(e);
      }}
      {...rest}
    >
      <span className={styles["label"]}>{label}</span>
      {kind === "code" ? (
        <span className={styles["code"]} aria-hidden="true">
          <Icon name="code" size={12} />
          code
        </span>
      ) : (
        <MemoViz viz={viz} bars={bars} />
      )}
      {handle("start")}
      {handle("end")}
    </button>
  );
});

/** Memoised: a lane re-render with unchanged props does not redraw the preview. */
export const Clip = memo(ClipImpl);
Clip.displayName = "Clip";
