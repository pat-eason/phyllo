import { forwardRef, type ComponentPropsWithoutRef } from "react";
import styles from "./Logo.module.css";

export interface LogoProps extends ComponentPropsWithoutRef<"span"> {
  /** Mark size in px. Default 24. */
  size?: number;
  /** Show "Phyllo" next to the mark. Default true. */
  wordmark?: boolean;
  /** Mark colour: the accent (default) or the text colour. */
  tone?: "accent" | "text";
  /** Draw the mark on a rounded panel tile (Toast, app icon). Default false. */
  tile?: boolean;
}

const DOT_COUNT = 40;
const GOLDEN_ANGLE = (137.508 * Math.PI) / 180;

let markPath: string | undefined;

/** Phyllotaxis mark: 40 dots at the golden angle on a 24 box, each dot a pair of arcs in one path. */
function getMarkPath(): string {
  if (markPath === undefined) {
    let d = "";
    for (let i = 1; i <= DOT_COUNT; i++) {
      const angle = i * GOLDEN_ANGLE;
      const radius = 1.72 * Math.sqrt(i);
      const dotRadius = 0.45 + (i / DOT_COUNT) * 0.95;
      const x = 12 + radius * Math.cos(angle);
      const y = 12 + radius * Math.sin(angle);
      const r = dotRadius.toFixed(2);
      d += `M${(x - dotRadius).toFixed(2)} ${y.toFixed(2)}a${r} ${r} 0 1 0 ${(2 * dotRadius).toFixed(2)} 0a${r} ${r} 0 1 0 ${(-2 * dotRadius).toFixed(2)} 0`;
    }
    markPath = d;
  }
  return markPath;
}

/** The Phyllo mark with an optional wordmark. Static; never recolour with track colours. */
export const Logo = forwardRef<HTMLSpanElement, LogoProps>(function Logo(
  { size = 24, wordmark = true, tone = "accent", tile = false, className, style, ...rest },
  ref,
) {
  const rootClass = className ? `${styles["logo"]} ${className}` : styles["logo"];
  // Standing alone (no wordmark) the mark is the only content, so the wrapper names it.
  const standalone = wordmark ? {} : { role: "img" as const, "aria-label": "Phyllo" };

  return (
    <span ref={ref} className={rootClass} style={style} {...standalone} {...rest}>
      <svg
        className={styles["mark"]}
        data-tone={tone}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        {tile ? <rect className={styles["tile"]} width="24" height="24" rx="6" /> : null}
        <path
          className={styles["dots"]}
          d={getMarkPath()}
          transform={tile ? "translate(12 12) scale(0.75) translate(-12 -12)" : undefined}
        />
      </svg>
      {wordmark ? <span className={styles["wordmark"]}>Phyllo</span> : null}
    </span>
  );
});
