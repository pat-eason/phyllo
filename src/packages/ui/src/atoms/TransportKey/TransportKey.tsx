import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName, type IconSize } from "../Icon";
import styles from "./TransportKey.module.css";

export type TransportKind = "play" | "stop" | "record" | "loop" | "to-start";
export type TransportKeySize = "md" | "lg";

export interface TransportKeyProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  kind: TransportKind;
  /** play: playing (pause glyph); loop: on; record: armed. Ignored by stop and to-start. */
  active?: boolean;
  /** `md` 36x36 (play 44x36); `lg` 44x44 (play 52x44). Default `md`. */
  size?: TransportKeySize;
}

interface KeyLook {
  icon: IconName;
  label: string;
  /** Toggle kinds expose their state with `aria-pressed`. */
  toggle: boolean;
}

function look(kind: TransportKind, active: boolean): KeyLook {
  switch (kind) {
    case "play":
      // The label flips with the state, so no aria-pressed (it would announce the state twice).
      return { icon: active ? "pause" : "play", label: active ? "Pause" : "Play", toggle: false };
    case "stop":
      return { icon: "stop", label: "Stop", toggle: false };
    case "record":
      return { icon: "record", label: active ? "Stop recording" : "Record", toggle: false };
    case "loop":
      return { icon: "loop", label: "Loop", toggle: true };
    case "to-start":
      return { icon: "to-start", label: "Back to start", toggle: false };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

const GLYPH_SIZE: Record<TransportKeySize, Record<TransportKind, IconSize>> = {
  md: { play: 18, stop: 16, record: 16, loop: 18, "to-start": 18 },
  lg: { play: 20, stop: 18, record: 18, loop: 20, "to-start": 20 },
};

/**
 * Hardware-style transport key. Purely presentational: the parent decides what a click does.
 * `aria-label` is derived from `kind` and `active` (override it by passing your own).
 */
export const TransportKey = forwardRef<HTMLButtonElement, TransportKeyProps>(function TransportKey(
  { kind, active = false, size = "md", className, type = "button", ...rest },
  ref,
) {
  const { icon, label, toggle } = look(kind, active);
  const classes = className ? `${styles["key"]} ${className}` : styles["key"];

  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={toggle ? active : undefined}
      className={classes}
      data-kind={kind}
      data-size={size}
      data-active={active && kind !== "stop" && kind !== "to-start" ? "" : undefined}
      {...rest}
    >
      {/* to-start is drawn with a solid triangle (Kit), so it takes the filled variant. */}
      <Icon name={icon} size={GLYPH_SIZE[size][kind]} filled={kind === "to-start"} />
    </button>
  );
});
