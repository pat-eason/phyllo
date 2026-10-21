import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { TransportKey, type TransportKeySize } from "../../atoms/TransportKey";
import styles from "./TransportControls.module.css";

export interface TransportControlsProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  playing: boolean;
  recording: boolean;
  loop: boolean;
  /** Moves the playhead to the start without stopping. */
  onToStart: () => void;
  onPlayPause: () => void;
  /** Stops and returns to the loop start (loop on) or bar 1. */
  onStop: () => void;
  onRecord: () => void;
  onLoopChange: (loop: boolean) => void;
  /** Hide the record key when no MIDI input is enabled. Default true. */
  showRecord?: boolean;
  /** Key size, `md` 36 px or `lg` 44 px. Default `md`. */
  size?: TransportKeySize;
}

/**
 * Transport cluster on a raised plate: To start, Play/Pause, Stop, Record, Loop (fixed order).
 * Controlled. Keys carry their own labels and pressed state; global shortcuts belong to the app header.
 */
export const TransportControls = forwardRef<HTMLDivElement, TransportControlsProps>(function TransportControls(
  {
    playing,
    recording,
    loop,
    onToStart,
    onPlayPause,
    onStop,
    onRecord,
    onLoopChange,
    showRecord = true,
    size = "md",
    className,
    ...rest
  },
  ref,
) {
  const classes = className ? `${styles["controls"]} ${className}` : styles["controls"];

  return (
    <div ref={ref} role="group" aria-label="Transport" className={classes} {...rest}>
      <TransportKey kind="to-start" size={size} onClick={onToStart} />
      <TransportKey kind="play" size={size} active={playing} onClick={onPlayPause} />
      <TransportKey kind="stop" size={size} onClick={onStop} />
      {showRecord ? <TransportKey kind="record" size={size} active={recording} onClick={onRecord} /> : null}
      <TransportKey kind="loop" size={size} active={loop} onClick={() => onLoopChange(!loop)} />
    </div>
  );
});
