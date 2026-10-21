import { forwardRef, useRef, type ForwardedRef, type HTMLAttributes, type KeyboardEvent, type ReactElement, type Ref } from "react";
import { Icon, type IconName } from "../Icon";
import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label?: string;
  icon?: IconName;
  /** Accessible name; required when the segment has an icon and no `label`. */
  ariaLabel?: string;
  /** For `semantics="tabs"`: id of the panel this tab controls. */
  controls?: string;
  disabled?: boolean;
}

export type SegmentedSemantics = "radio" | "tabs" | "toggle";

export interface SegmentedControlProps<T extends string> extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "role" | "children"> {
  /** 2-4 options. */
  options: SegmentedOption<T>[];
  value: T;
  /** Receives the chosen value, not the event. */
  onChange: (value: T) => void;
  /** Group accessible name, e.g. "Interface depth". */
  label: string;
  /** Selected look: `accent` fill (Guided/Pro, theme) or `neutral` raised (tabs, scope). Default `neutral`. */
  tone?: "accent" | "neutral";
  /** Segment height: 26 or 30 px. Default `md` (30). */
  size?: "sm" | "md";
  /**
   * `radio` (default): `radiogroup` of radios, arrow keys move the selection.
   * `tabs`: `tablist` of tabs with `aria-selected`; the parent links `aria-controls` panels. When the control has an `id`,
   * each tab gets `id="<id>-tab-<value>"` for the panel's `aria-labelledby`.
   * `toggle`: a group of buttons with `aria-pressed`, each in the tab order.
   */
  semantics?: SegmentedSemantics;
  /** Segments share the full width (library tabs). */
  stretch?: boolean;
}

const GROUP_ROLE = { radio: "radiogroup", tabs: "tablist", toggle: "group" } as const;
const ICON_SIZE = { sm: 14, md: 16 } as const;

function SegmentedControlInner<T extends string>(
  {
    options,
    value,
    onChange,
    label,
    tone = "neutral",
    size = "md",
    semantics = "radio",
    stretch = false,
    id,
    className,
    ...rest
  }: SegmentedControlProps<T>,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const segmentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const classes = className ? `${styles["control"]} ${className}` : styles["control"];
  const roving = semantics !== "toggle";
  const selectedIndex = options.findIndex((option) => option.value === value);
  // With no match, the first enabled segment still has to be reachable by Tab.
  const tabStopIndex = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);

  function move(from: number, step: 1 | -1) {
    for (let i = 1; i <= options.length; i += 1) {
      const index = (from + step * i + options.length * i) % options.length;
      const candidate = options[index];
      if (candidate && !candidate.disabled) return index;
    }
    return from;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!roving) return;
    let target: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = move(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = move(index, -1);
        break;
      case "Home":
        target = move(-1, 1);
        break;
      case "End":
        target = move(options.length, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = options[target];
    if (!next) return;
    if (next.value !== value) onChange(next.value);
    segmentRefs.current[target]?.focus();
  }

  return (
    <div
      ref={ref}
      id={id}
      role={GROUP_ROLE[semantics]}
      aria-label={label}
      className={classes}
      data-tone={tone}
      data-size={size}
      data-stretch={stretch ? "" : undefined}
      {...rest}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const roleProps =
          semantics === "radio"
            ? { role: "radio", "aria-checked": selected }
            : semantics === "tabs"
              ? { role: "tab", "aria-selected": selected, "aria-controls": option.controls, id: id ? `${id}-tab-${option.value}` : undefined }
              : { "aria-pressed": selected };

        return (
          <button
            key={option.value}
            ref={(node) => {
              segmentRefs.current[index] = node;
            }}
            type="button"
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            tabIndex={roving && index !== tabStopIndex ? -1 : undefined}
            className={styles["segment"]}
            data-selected={selected ? "" : undefined}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            {...roleProps}
          >
            {option.icon ? <Icon name={option.icon} size={ICON_SIZE[size]} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 2-4 mutually exclusive options in a track. Controlled: pass `value` and `onChange(value)`. */
export const SegmentedControl = forwardRef(SegmentedControlInner) as <T extends string>(
  props: SegmentedControlProps<T> & { ref?: Ref<HTMLDivElement> },
) => ReactElement;
