import { createModifier } from "@phyllo/model";
import type { Track } from "@phyllo/model";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useProject } from "../../../hooks";
import { effectOptions } from "./stripModel";
import type { EffectOption } from "./stripModel";
import styles from "./ChannelStrip.module.css";

/** "+ Effect": a small menu of common params (added at a sensible value) and effect modifiers. */
export function EffectMenu({ track }: { track: Track }) {
  const { dispatch } = useProject();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const options = effectOptions(track);
  const params = options.filter((o) => o.kind === "param");
  const modifiers = options.filter((o) => o.kind === "modifier");

  useEffect(() => {
    if (!open) return;
    items.current.find(Boolean)?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const choose = (option: EffectOption) => {
    if (option.kind === "param" && option.param && option.value !== undefined) {
      dispatch({ type: "track/setParam", trackId: track.id, param: option.param, value: option.value });
    } else if (option.template) {
      dispatch({
        type: "modifier/add",
        trackId: track.id,
        modifier: createModifier(option.template, { label: option.description, origin: "user" }),
      });
    }
    close(true);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items.current.filter((el): el is HTMLButtonElement => el !== null);
    const index = list.findIndex((el) => el === document.activeElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (index + 1) % list.length;
    else if (event.key === "ArrowUp") next = (index - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    } else if (event.key === "Tab") {
      close(false);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      event.stopPropagation();
      list[next]?.focus();
    }
  };

  const renderItem = (option: EffectOption, i: number) => (
    <button
      key={option.id}
      ref={(el) => {
        items.current[i] = el;
      }}
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={styles["menuItem"]}
      onClick={() => choose(option)}
    >
      <code>{option.code}</code>
      <span>{option.description}</span>
    </button>
  );

  return (
    <div className={styles["effect"]} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={styles["addEffect"]}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Add effect to ${track.name}`}
        disabled={options.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        + Effect
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={`Effects for ${track.name}`} className={styles["menu"]} onKeyDown={onMenuKeyDown} tabIndex={-1}>
          {params.length > 0 && (
            <div role="group" aria-label="Parameters" className={styles["menuGroup"]}>
              <span className={styles["menuHeading"]} aria-hidden="true">
                Parameters
              </span>
              {params.map((o, i) => renderItem(o, i))}
            </div>
          )}
          {modifiers.length > 0 && (
            <div role="group" aria-label="Modifiers" className={styles["menuGroup"]}>
              <span className={styles["menuHeading"]} aria-hidden="true">
                Modifiers
              </span>
              {modifiers.map((o, i) => renderItem(o, params.length + i))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
