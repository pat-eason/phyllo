import type { Track, UiMode } from "@phyllo/model";
import { Icon } from "@phyllo/ui";
import { useId, useRef, useState } from "react";
import { SearchPopover } from "./SearchPopover";
import type { SearchItem } from "./SearchPopover";
import { filterSounds, soundChoices, soundSlot } from "./inspectorModel";
import type { InspectorActions } from "./useInspectorActions";
import styles from "./Inspector.module.css";

export interface SoundSectionProps {
  track: Track;
  mode: UiMode;
  actions: InspectorActions;
}

/** "Sound" picker: shows the source code (`s("sawtooth")`, `.bank("RolandTR909")`), opens a searchable list. */
export function SoundSection({ track, mode, actions }: SoundSectionProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const headingId = useId();
  const slot = soundSlot(track);
  const choices = soundChoices(track);
  const guided = mode === "guided";

  const itemsFor = (query: string): SearchItem[] =>
    filterSounds(choices, query).map((s) => ({
      key: s.code,
      code: guided ? s.name : s.code,
      text: guided ? `${s.code} · ${s.description}` : `${s.name} · ${s.description}`,
      selected: s.code === slot.current,
    }));

  const pick = (code: string) => {
    if (code === slot.current) return;
    actions.setSource(slot.field === "bank" ? { bank: code } : { sound: code });
  };

  return (
    <section className={styles["section"]} aria-labelledby={headingId}>
      <div className={styles["sectionHead"]}>
        <h3 id={headingId} className={styles["legend"]}>
          Sound
        </h3>
        {track.kind !== "code" ? <span className={styles["codeLabel"]}>{slot.label}</span> : null}
      </div>
      {track.kind === "code" ? (
        <p className={styles["note"]}>Code track — edit in the code drawer</p>
      ) : (
        <div className={styles["anchor"]}>
          <button
            ref={trigger}
            type="button"
            className={styles["picker"]}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`Sound: ${slot.code}. Change sound`}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={styles["pickerCode"]}>{slot.code}</span>
            <Icon name="chevron-down" size={14} />
          </button>
          {open ? (
            <SearchPopover
              label={slot.field === "bank" ? "Choose a drum machine" : "Choose a sound"}
              searchLabel={slot.field === "bank" ? "Search drum machines" : "Search sounds"}
              placeholder={guided ? "Try “warm” or “bright”" : "Search sounds"}
              itemsFor={itemsFor}
              onPick={(item) => pick(item.key)}
              freeText={slot.field === "sound" ? { label: "Use this sound name as typed", onPick: pick } : undefined}
              onClose={() => setOpen(false)}
              returnFocus={trigger}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
