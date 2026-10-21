import { ACCENTS, Knob, SegmentedControl, StatusDot, StepCell, Swatch, TransportKey, useMediaQuery } from "@phyllo/ui";
import type { Accent, SegmentedOption, ThemeMode } from "@phyllo/ui";
import tokens from "@phyllo/ui/tokens.json";
import { useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useSettings } from "../../../hooks";
import styles from "./AccentPicker.module.css";

const THEME_OPTIONS: SegmentedOption<ThemeMode>[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Match system" },
];

const GUIDED_PRO_OPTIONS: SegmentedOption<"guided" | "pro">[] = [
  { value: "guided", label: "Guided" },
  { value: "pro", label: "Pro" },
];

const ACCENT_NAMES: Record<Accent, string> = {
  green: "Green",
  red: "Red",
  blue: "Blue",
  purple: "Purple",
  orange: "Orange",
  teal: "Teal",
};

const PREVIEW_STEPS = [true, false, true, false] as const;
const NOOP = () => {};

export interface AccentPickerProps {
  className?: string;
}

/**
 * Theme (Dark / Light / Match system) and accent (six swatches, each split into its dark and light shade),
 * plus a live preview drawn in the chosen theme. Reads and writes `settings.appearance`; choices apply at once.
 */
export function AccentPicker({ className }: AccentPickerProps) {
  const { settings, set } = useSettings();
  const { mode, accent } = settings.appearance;
  const themeLabelId = useId();
  const accentLabelId = useId();
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function chooseAccent(next: Accent, focus: boolean) {
    set("appearance", { accent: next });
    if (focus) swatchRefs.current[ACCENTS.indexOf(next)]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = ACCENTS.indexOf(accent);
    let target: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = (index + 1) % ACCENTS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = (index - 1 + ACCENTS.length) % ACCENTS.length;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = ACCENTS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = ACCENTS[target];
    if (next) chooseAccent(next, true);
  }

  const classes = className ? `${styles["picker"]} ${className}` : styles["picker"];

  return (
    <div className={classes}>
      <div className={styles["row"]}>
        <span id={themeLabelId} className={styles["rowLabel"]}>
          Theme
        </span>
        <SegmentedControl
          options={THEME_OPTIONS}
          value={mode}
          onChange={(next) => set("appearance", { mode: next })}
          label="Theme"
          aria-labelledby={themeLabelId}
          tone="accent"
        />
      </div>

      <div className={styles["row"]} data-align="start">
        <span id={accentLabelId} className={`${styles["rowLabel"]} ${styles["accentLabel"]}`}>
          Accent
        </span>
        <div className={styles["accentColumn"]}>
          {/* The group owns arrow-key movement (Swatch is a plain radio); the checked swatch is the tab stop. */}
          <div role="radiogroup" aria-labelledby={accentLabelId} className={styles["swatches"]}>
            {ACCENTS.map((id, index) => (
              <Swatch
                key={id}
                ref={(node) => {
                  swatchRefs.current[index] = node;
                }}
                color={[tokens.accent[id].dark, tokens.accent[id].light]}
                selected={accent === id}
                onSelect={() => chooseAccent(id, false)}
                label={ACCENT_NAMES[id]}
                size={40}
                showLabel
                tabIndex={accent === id ? 0 : -1}
                onKeyDown={handleKeyDown}
              />
            ))}
          </div>
          {accent === "red" ? (
            <p className={styles["note"]} role="note">
              Red sits close to the record color, so record and mute turn magenta while Red is your accent.
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles["row"]} data-divider="">
        <span className={styles["rowLabel"]}>Preview</span>
        <PreviewStrip mode={mode} accent={accent} />
      </div>
    </div>
  );
}

interface PreviewStripProps {
  mode: ThemeMode;
  accent: Accent;
}

/** A mini UI in the chosen theme and accent. Nested `data-theme`/`data-accent` re-scope every token (D17). */
function PreviewStrip({ mode, accent }: PreviewStripProps) {
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)", true);
  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  return (
    <div className={styles["preview"]} data-theme={resolved} data-accent={accent} aria-hidden="true" inert>
      <TransportKey kind="play" onClick={NOOP} />
      {accent === "red" ? <TransportKey kind="record" onClick={NOOP} /> : null}
      <SegmentedControl options={GUIDED_PRO_OPTIONS} value="guided" onChange={NOOP} label="Preview interface depth" tone="accent" size="sm" />
      <Knob value={0.62} onChange={NOOP} label="Preview knob" valueText="62%" size={34} />
      <span className={styles["steps"]}>
        {PREVIEW_STEPS.map((on, index) => (
          <StepCell key={index} on={on} onChange={NOOP} color="var(--ph-accent)" index={index} rowLabel="Preview" readOnly />
        ))}
      </span>
      <span className={styles["code"]}>
        <span className={styles["keyword"]}>$:</span> s(&quot;bd*4&quot;)
      </span>
      <StatusDot status="ok" label="Live" badge />
    </div>
  );
}
