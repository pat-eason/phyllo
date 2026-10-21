import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, type CSSProperties } from "react";
import tokens from "../tokens.json";
import { ACCENTS, useTheme } from "./ThemeProvider";
import styles from "./Tokens.module.css";

const NEUTRALS = [
  "bg",
  "chrome",
  "panel",
  "raised",
  "sunken",
  "line",
  "line-soft",
  "text",
  "muted",
  "rec",
  "star",
  "switch-off",
  "step-off",
  "step-beat",
] as const;

const TRACKS = [1, 2, 3, 4, 5, 6, 7] as const;

interface TypeSample {
  token: string;
  sample: string;
  style?: CSSProperties;
}

const TYPE_SAMPLES: TypeSample[] = [
  { token: "display", sample: "Make something", style: { letterSpacing: "-0.025em" } },
  { token: "title", sample: "Your first groove", style: { letterSpacing: "-0.015em" } },
  { token: "wordmark", sample: "Phyllo" },
  { token: "heading", sample: "Library and tracks" },
  { token: "subheading", sample: "Drums, bass and keys" },
  { token: "body-lg", sample: "Drag a sound onto the timeline to start a track." },
  { token: "body", sample: "Drag a sound onto the timeline to start a track." },
  { token: "small", sample: "Evaluated 2 seconds ago" },
  { token: "label", sample: "Section label", style: { letterSpacing: "0.08em", textTransform: "uppercase" } },
  { token: "legend", sample: "Cutoff", style: { letterSpacing: "0.1em", textTransform: "uppercase" } },
  { token: "code", sample: 's("bd*4").lpf(800)' },
  { token: "readout", sample: "012.3.4  120 BPM" },
];

/** `token` is a CSS variable name; `color` overrides it with a literal value. Shows the resolved value. */
function Swatch({ name, token, color, selected }: { name: string; token?: string; color?: string; selected?: boolean }) {
  const { theme, accent } = useTheme();
  const valueRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // Passive effect: runs after ThemeProvider has written data-theme / data-accent.
    if (token && valueRef.current) {
      valueRef.current.textContent = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    }
  }, [token, theme, accent]);

  return (
    <div className={styles["card"]}>
      <div
        className={`${styles["chip"]} ${selected ? styles["selected"] : ""}`}
        style={{ background: color ?? `var(${token})` }}
      />
      <div className={styles["label"]}>
        <span className={styles["name"]}>{name}</span>
        <span ref={valueRef} className={styles["value"]}>{color ?? "\u00a0"}</span>
      </div>
    </div>
  );
}

function Tokens() {
  const { theme, accent } = useTheme();
  return (
    <div className={styles["page"]}>
      <section>
        <h2 className={styles["heading"]}>Neutral ({theme})</h2>
        <div className={styles["grid"]}>
          {NEUTRALS.map((n) => (
            <Swatch key={n} name={`--ph-${n}`} token={`--ph-${n}`} />
          ))}
        </div>
      </section>

      <section>
        <h2 className={styles["heading"]}>Accent (current: {accent})</h2>
        <div className={styles["grid"]}>
          <Swatch name="--ph-accent" token="--ph-accent" />
          <Swatch name="--ph-accent-ink" token="--ph-accent-ink" />
          <Swatch name="--ph-accent-soft" token="--ph-accent-soft" />
        </div>
      </section>

      <section>
        <h2 className={styles["heading"]}>All accents ({theme} shade)</h2>
        <div className={styles["grid"]}>
          {ACCENTS.map((a) => (
            <Swatch
              key={a}
              name={a}
              color={tokens.accent[a][theme]}
              selected={a === accent}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className={styles["heading"]}>Track palette</h2>
        <div className={styles["grid"]}>
          {TRACKS.map((n) => (
            <Swatch key={n} name={`--ph-track-${n}`} token={`--ph-track-${n}`} />
          ))}
        </div>
      </section>

      <section>
        <h2 className={styles["heading"]}>Type</h2>
        <div className={styles["types"]}>
          {TYPE_SAMPLES.map(({ token, sample, style }) => (
            <div key={token} className={styles["typeRow"]}>
              <span className={styles["typeName"]}>--ph-text-{token}</span>
              <span style={{ font: `var(--ph-text-${token})`, ...style }}>{sample}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const meta = {
  title: "Foundations/Tokens",
  component: Tokens,
} satisfies Meta<typeof Tokens>;

export default meta;

export const Overview: StoryObj<typeof meta> = {};
