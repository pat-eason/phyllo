import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import { Icon } from "../../atoms/Icon";
import { Meter, type MeterSubscribe } from "../../atoms/Meter";
import { ToggleButton, type ToggleButtonProps } from "../../atoms/ToggleButton";
import styles from "./TrackHeader.module.css";

/** Lets a context menu start the same inline rename as F2 / double-click. */
export interface TrackHeaderRenameHandle {
  /** Starts renaming; does nothing when the header has no `onRename`. */
  start: () => void;
}

export interface TrackHeaderProps extends Omit<ComponentPropsWithoutRef<"div">, "onSelect" | "color"> {
  name: string;
  /** Code form of the sound: `s("bd").bank("RolandTR909")`. Shown in mono, ellipsised. */
  sound: string;
  /** Track colour (one of the track palette), drawn as the 4 px strip. */
  color: string;
  selected: boolean;
  muted: boolean;
  soloed: boolean;
  /** Declarative meter level 0–1. For live audio pass `meterSubscribe` instead so nothing re-renders per frame. */
  level?: number;
  /** Live meter feed (see `Meter`'s `subscribe`). */
  meterSubscribe?: MeterSubscribe;
  /** Peak-hold tick on the meter (see `Meter`'s `hold`). */
  meterHold?: boolean;
  /** Transport stopped: the meter drops to 0 at once instead of falling (see `Meter`'s `stopped`). */
  meterStopped?: boolean;
  /**
   * Evaluation error for this track: shows a red dot (tooltip and image name = the message) and adds the message to the
   * name button's `aria-describedby`, so keyboard and screen-reader users hear it when they focus the track.
   */
  error?: string;
  /** The track is a raw-code track (SPEC 4.4): shows a code badge. */
  codeTrack?: boolean;
  /** Accessible name of the code badge. Default "Code track". */
  codeLabel?: string;
  /** Click or Enter on the name area selects the track. */
  onSelect: () => void;
  /** Next muted state; the click event comes second for modifier behaviour (Cmd-click = mute all others). */
  onMuteChange: (muted: boolean, event: MouseEvent<HTMLButtonElement>) => void;
  /** Next soloed state; the click event comes second for modifier behaviour (Alt-click = exclusive solo). */
  onSoloChange: (soloed: boolean, event: MouseEvent<HTMLButtonElement>) => void;
  /** Double-click the name (or F2) to rename in place; Enter commits, Escape cancels. */
  onRename?: (name: string) => void;
  /** Imperative handle to start the inline rename from outside (a context menu's Rename item). */
  renameHandle?: Ref<TrackHeaderRenameHandle>;
  /** Shows a remove button (on hover, focus or selection) and removes on Delete/Backspace from the name button. */
  onRemove?: () => void;
  /** Extra native props for the Mute button, e.g. `data-tip-target`. `pressed`, `kind`, `label` and `onChange` stay owned by the header. */
  muteProps?: TrackHeaderToggleProps;
  /** Extra native props for the Solo button (see `muteProps`). */
  soloProps?: TrackHeaderToggleProps;
}

export type TrackHeaderToggleProps = Omit<ToggleButtonProps, "kind" | "pressed" | "onChange" | "label" | "children"> & {
  [dataAttribute: `data-${string}`]: string | undefined;
};

/**
 * Left column of a timeline lane: colour strip, selectable name + sound code, level meter and Mute/Solo.
 * Fixed at `--ph-track-header-w` × `--ph-lane-h`; long sound strings are ellipsised and never widen it.
 */
export const TrackHeader = forwardRef<HTMLDivElement, TrackHeaderProps>(function TrackHeader(
  {
    name,
    sound,
    color,
    selected,
    muted,
    soloed,
    level,
    meterSubscribe,
    meterHold = false,
    meterStopped = false,
    error,
    codeTrack = false,
    codeLabel = "Code track",
    onSelect,
    onMuteChange,
    onSoloChange,
    onRename,
    renameHandle,
    onRemove,
    muteProps,
    soloProps,
    className,
    style,
    ...rest
  },
  ref,
) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const soundId = `${uid}-sound`;
  const errorId = `${uid}-error`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const nameButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const classes = className ? `${styles["header"]} ${className}` : styles["header"];

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      nameButton.current?.focus();
    }
  }, [editing]);

  function startEditing() {
    if (!onRename) return;
    setDraft(name);
    setEditing(true);
  }

  useImperativeHandle(renameHandle, () => ({ start: startEditing }));

  /** Ends the edit; `keepFocus` hands focus back to the name button (Enter/Escape, not Tab-away). */
  function finish(save: boolean, keepFocus: boolean) {
    refocus.current = keepFocus;
    setEditing(false);
    const next = draft.trim();
    if (save && next !== "" && next !== name) onRename?.(next);
  }

  function onNameKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "F2") startEditing();
    if (onRemove && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      onRemove();
    }
  }

  const meterProps = {
    ...(level === undefined ? {} : { level }),
    ...(meterSubscribe === undefined ? {} : { subscribe: meterSubscribe }),
    hold: meterHold,
    stopped: meterStopped,
  };

  return (
    <div
      ref={ref}
      className={classes}
      data-selected={selected ? "" : undefined}
      data-error={error ? "" : undefined}
      style={style}
      {...rest}
    >
      <span className={styles["strip"]} style={{ background: color }} aria-hidden="true" />
      <div className={styles["text"]} data-marked={codeTrack || error ? "" : undefined}>
        {editing ? (
          <>
            <input
              ref={input}
              className={styles["rename"]}
              aria-label={`Rename track ${name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => finish(true, false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  // Stop the Enter keypress from activating the button focus is about to return to.
                  e.preventDefault();
                  finish(e.key === "Enter", true);
                }
              }}
            />
            <span className={styles["sound"]}>{sound}</span>
          </>
        ) : (
          // The button holds only the name, so its accessible name is exactly its visible text (WCAG 2.5.3); the sound
          // line sits under it as the description, and the button's ::after stretches its hit area over both lines.
          <div className={styles["stack"]}>
            <button
              ref={nameButton}
              type="button"
              className={styles["select"]}
              aria-pressed={selected}
              aria-labelledby={nameId}
              aria-describedby={error ? `${soundId} ${errorId}` : soundId}
              onClick={onSelect}
              onDoubleClick={startEditing}
              onKeyDown={onNameKeyDown}
            >
              <span id={nameId} className={styles["name"]}>
                {name}
              </span>
            </button>
            <span id={soundId} className={styles["sound"]}>
              {sound}
            </span>
          </div>
        )}
        {error ? (
          <span id={errorId} className={styles["visuallyHidden"]}>
            {`Error: ${error}`}
          </span>
        ) : null}
        {codeTrack || error ? (
          <span className={styles["marks"]}>
            {codeTrack ? (
              <span className={styles["badge"]} role="img" aria-label={codeLabel} title={codeLabel}>
                <Icon name="code" size={12} />
              </span>
            ) : null}
            {error ? (
              <span className={styles["errorDot"]} role="img" aria-label={`Error: ${error}`} title={error} />
            ) : null}
          </span>
        ) : null}
      </div>
      <Meter className={styles["meter"]} {...meterProps} />
      {onRemove ? (
        <button type="button" className={styles["remove"]} aria-label={`Remove ${name}`} title="Remove track" onClick={onRemove}>
          <Icon name="close" size={12} />
        </button>
      ) : null}
      <ToggleButton {...muteProps} kind="mute" label={`Mute ${name}`} pressed={muted} onChange={onMuteChange} />
      <ToggleButton {...soloProps} kind="solo" label={`Solo ${name}`} pressed={soloed} onChange={onSoloChange} />
    </div>
  );
});
