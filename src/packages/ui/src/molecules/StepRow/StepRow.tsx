import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { StepCell } from "../../atoms/StepCell";
import styles from "./StepRow.module.css";

/** Imperative handle: the playhead moves without re-rendering the row. */
export interface StepRowHandle {
  /** Highlights step `i` (0-based) as the current step; `null` clears it. */
  setCurrentStep: (step: number | null) => void;
  /** The row element (`role="row"`). */
  readonly element: HTMLDivElement | null;
}

export interface StepRowProps extends Omit<ComponentPropsWithoutRef<"div">, "children" | "role" | "color" | "onSelect"> {
  /** Sound code, e.g. `bd` (shown mono under the label). */
  sound: string;
  /** Friendly name, e.g. "Kick". Also names the cells ("Kick step 5"). */
  label: string;
  /** Row color for the swatch and on-cells. */
  color: string;
  /** One cycle of steps (usually 16). */
  steps: boolean[];
  /** Per-step velocity 0–1 for on-cells (fill opacity). */
  velocities?: number[];
  /** Mini-notation this row writes; `null` shows "—". */
  mini: string | null;
  /** Selected row: `--ph-sel` tint, accent border on the label. */
  selected: boolean;
  /** Steps per beat group (first of each group is tinted). Default 4. */
  stepsPerBeat?: number;
  /**
   * Initial / declarative current step. While playing, prefer the ref handle's `setCurrentStep` so the
   * playhead doesn't re-render the row.
   */
  playingStep?: number | null;
  /** Keyboard (Space / Enter on a cell), or any click when paint handlers are absent. */
  onToggleStep: (step: number) => void;
  /** Pointer-down on a cell: the paint value is the opposite of that cell. With it, clicks are painted, not toggled. */
  onPaintStart?: (step: number, value: boolean) => void;
  /** The pointer entered another cell of this row while painting. */
  onPaintEnter?: (step: number) => void;
  /** The label button was pressed. */
  onSelect: () => void;
  /** Audition the row's sound. When given, the label's colour square becomes its own "Preview" button. */
  onPreview?: () => void;
}

const StepRowImpl = forwardRef<StepRowHandle, StepRowProps>(function StepRow(
  {
    sound,
    label,
    color,
    steps,
    velocities,
    mini,
    selected,
    stepsPerBeat = 4,
    playingStep,
    onToggleStep,
    onPaintStart,
    onPaintEnter,
    onSelect,
    onPreview,
    className,
    style,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const current = useRef<number | null>(null);
  const painting = useRef(false);
  // Roving tabindex: the row's cells are one tab stop (the last one focused); ←/→/Home/End move between them.
  const [active, setActive] = useState(0);
  const tabStop = Math.min(active, Math.max(0, steps.length - 1));

  useImperativeHandle(
    ref,
    () => ({
      setCurrentStep(step) {
        const next = step === null || step < 0 ? null : step;
        if (next === current.current) return;
        if (current.current !== null) cells.current[current.current]?.removeAttribute("data-playing");
        if (next !== null) cells.current[next]?.setAttribute("data-playing", "");
        current.current = next;
      },
      get element() {
        return rowRef.current;
      },
    }),
    [],
  );

  // The highlight is DOM state outside React; apply the declarative prop through the same path.
  useLayoutEffect(() => {
    if (playingStep === undefined) return;
    const next = playingStep === null || playingStep < 0 ? null : playingStep;
    if (current.current !== null) cells.current[current.current]?.removeAttribute("data-playing");
    if (next !== null) cells.current[next]?.setAttribute("data-playing", "");
    current.current = next;
  }, [playingStep]);

  useEffect(() => {
    const stop = () => {
      painting.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
    const from = cells.current.findIndex((cell) => cell !== null && cell === event.target);
    if (from < 0 || from >= steps.length) return;
    let to: number;
    if (event.key === "ArrowRight") to = Math.min(steps.length - 1, from + 1);
    else if (event.key === "ArrowLeft") to = Math.max(0, from - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = steps.length - 1;
    else return;
    event.preventDefault();
    cells.current[to]?.focus();
  }

  const per = Math.max(1, Math.floor(stepsPerBeat));
  const groups: number[][] = [];
  for (let i = 0; i < steps.length; i += per) {
    groups.push(Array.from({ length: Math.min(per, steps.length - i) }, (_, k) => i + k));
  }

  const classes = [styles["row"], className].filter(Boolean).join(" ");
  const rowStyle = { ...style, "--row-color": color, "--beat-cols": per } as CSSProperties;

  return (
    // The key handler only moves focus between the row's own buttons (roving tabindex); the row itself isn't a stop.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      ref={rowRef}
      role="row"
      className={classes}
      style={rowStyle}
      data-selected={selected ? "" : undefined}
      {...rest}
      onKeyDown={handleKeyDown}
    >
      <div role="gridcell" className={styles["labelCell"]}>
        <button type="button" className={styles["label"]} aria-label={`${label} ${sound}`} aria-pressed={selected} onClick={onSelect}>
          <span className={styles["swatch"]} aria-hidden="true" />
          <span className={styles["names"]}>
            <span className={styles["name"]}>{label}</span>{" "}
            <span className={styles["sound"]}>{sound}</span>
          </span>
        </button>
        {onPreview ? (
          <button type="button" className={styles["preview"]} aria-label={`Preview ${label}`} onClick={onPreview} />
        ) : null}
      </div>

      <div className={styles["steps"]} style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
        {groups.map((group, g) => (
          <div key={g} className={styles["beat"]}>
            {group.map((i) => (
              <div key={i} role="gridcell" className={styles["cell"]}>
                <StepCell
                  ref={(el) => {
                    cells.current[i] = el;
                  }}
                  index={i}
                  tabIndex={i === tabStop ? 0 : -1}
                  onFocus={() => setActive(i)}
                  rowLabel={label}
                  color={color}
                  on={steps[i] ?? false}
                  velocity={velocities?.[i]}
                  beatStart={i % per === 0}
                  onChange={() => onToggleStep(i)}
                  onPointerDown={(e) => {
                    if (!onPaintStart || e.button !== 0) return;
                    // Touch pointers are captured by the pressed cell; release so the next cell gets pointerenter.
                    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                    painting.current = true;
                    onPaintStart(i, !(steps[i] ?? false));
                  }}
                  onPointerEnter={() => {
                    if (painting.current) onPaintEnter?.(i);
                  }}
                  onClick={(e) => {
                    // Pointer clicks (detail > 0) were already painted on pointer-down.
                    if (onPaintStart && e.detail > 0) e.preventDefault();
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div role="gridcell" className={styles["mini"]} data-empty={mini ? undefined : ""} title={mini ?? undefined}>
        {mini ?? "—"}
      </div>
    </div>
  );
});

/** One drum sound across one cycle: label button, step cells in beat groups, and the mini-notation it writes. */
export const StepRow = memo(StepRowImpl);
StepRow.displayName = "StepRow";
