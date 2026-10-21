import { forwardRef, type ComponentPropsWithoutRef } from "react";
import styles from "./Kbd.module.css";

export interface KbdProps extends Omit<ComponentPropsWithoutRef<"kbd">, "children"> {
  /** `['⌘', 'K']` renders as one glyph group ("⌘K"). */
  keys: string[];
}

const SPOKEN: Readonly<Record<string, string>> = {
  "⌘": "Command",
  "⌥": "Option",
  "⇧": "Shift",
  "⌃": "Control",
  "⏎": "Return",
  "↵": "Return",
  "⌫": "Delete",
  "⎋": "Escape",
  "⇥": "Tab",
  "←": "Left arrow",
  "→": "Right arrow",
  "↑": "Up arrow",
  "↓": "Down arrow",
};

/** Spoken form for glyph keys ("Command K"); undefined when every key is already plain text. */
function spokenLabel(keys: string[]): string | undefined {
  if (!keys.some((key) => key in SPOKEN)) return undefined;
  return keys.map((key) => SPOKEN[key] ?? key).join(" ");
}

/** Keyboard shortcut glyph. Platform-specific keys are passed in by the caller. */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd({ keys, className, ...rest }, ref) {
  const classes = className ? `${styles["kbd"]} ${className}` : styles["kbd"];
  return (
    <kbd ref={ref} className={classes} aria-label={spokenLabel(keys)} {...rest}>
      {keys.some((key) => key.length > 1 && !(key in SPOKEN)) ? keys.join("+") : keys.join("")}
    </kbd>
  );
});
