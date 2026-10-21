import { useRef, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { useProjectSelector } from "../../../hooks";
import { ChannelStrip } from "../ChannelStrip";
import styles from "./MixerStrips.module.css";

export type MixerStripsProps = Omit<ComponentPropsWithoutRef<"div">, "children">;

const FOCUSABLE = 'button:not(:disabled), [role="slider"]:not([aria-disabled="true"]), select:not(:disabled), input:not(:disabled)';
/** Controls that use the arrow keys themselves; Left/Right only hop strips from buttons. */
const HOPS_FROM = "button";

/**
 * The Mixer screen body (SPEC §6.4): the `.gain()` / `.room()` / `.delay()` hint, then one strip per track,
 * one bus strip per orbit in use, and the master, in a horizontally scrolling `role="toolbar"` row.
 * ←/→ on a strip's buttons move to the neighbouring strip (Home/End: first/last); sliders keep their arrows.
 */
export function MixerStrips({ className, ...rest }: MixerStripsProps) {
  const trackIds = useProjectSelector((p) => p.tracks.map((t) => t.id));
  const orbits = useProjectSelector((p) => [...new Set(p.tracks.map((t) => t.orbit))].sort((a, b) => a - b));
  const row = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !row.current) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(HOPS_FROM) || target.closest('[role="menu"]')) return;
    const strips = Array.from(row.current.querySelectorAll<HTMLElement>("[data-strip]"));
    const current = strips.findIndex((s) => s.contains(target));
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(strips.length - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else next = strips.length - 1;
    event.preventDefault();
    if (next === current) return;
    const strip = strips[next];
    strip?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    strip?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  return (
    <div className={[styles["mixer"], className].filter(Boolean).join(" ")} {...rest}>
      <p className={styles["hint"]}>
        Faders write <code>.gain()</code> · sends write <code>.room()</code> and <code>.delay()</code> on the track’s bus.
      </p>
      <div className={styles["scroller"]}>
        <div ref={row} className={styles["row"]} role="toolbar" aria-label="Mixer strips" aria-orientation="horizontal" onKeyDown={onKeyDown}>
          {trackIds.map((id) => (
            <ChannelStrip key={id} kind="track" trackId={id} />
          ))}
          {orbits.map((orbit) => (
            <ChannelStrip key={`bus-${orbit}`} kind="bus" orbit={orbit} />
          ))}
          <ChannelStrip kind="master" />
        </div>
      </div>
    </div>
  );
}
