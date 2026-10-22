import styles from "./Splash.module.css";

/** How long the startup animation holds the window, in ms. */
export const SPLASH_MS = 3000;

const BARS = 7;

/** Startup animation: the wordmark rises over a row of pulsing level bars, then fades into the first screen. */
export function Splash({ durationMs }: { durationMs: number }) {
  return (
    <div className={styles["splash"]} role="status" aria-label="Phyllo is starting" style={{ "--splash-ms": `${durationMs}ms` } as React.CSSProperties}>
      <div className={styles["bars"]} aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <span key={i} className={styles["bar"]} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <h1 className={styles["wordmark"]}>Phyllo</h1>
    </div>
  );
}
