import { BPM_MAX, BPM_MIN, clampBpm } from "@phyllo/model";
import { Button, IconButton } from "@phyllo/ui";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import styles from "./StarterPicker.module.css";
import { registerTap } from "./tapTempo";

export interface TempoStepperProps {
  bpm: number;
  onChange: (bpm: number) => void;
}

/**
 * Tempo group: −/+ 1 BPM, an editable number (Enter or blur commits, ↑/↓ nudge by 1, ⇧↑/↓ by 10) and Tap tempo
 * (average of the last four taps). Always clamps to 40–240.
 */
export function TempoStepper({ bpm, onChange }: TempoStepperProps) {
  const labelId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const taps = useRef<number[]>([]);

  const set = (next: number) => onChange(clampBpm(next));

  const commit = () => {
    if (draft === null) return;
    const typed = Number.parseInt(draft, 10);
    if (!Number.isNaN(typed)) set(typed);
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      setDraft(null);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
      setDraft(null);
      set(bpm + step);
    }
  };

  const tap = () => {
    const result = registerTap(taps.current, Date.now());
    taps.current = result.taps;
    if (result.bpm !== null) set(result.bpm);
  };

  return (
    <div className={styles["field"]}>
      <span id={labelId} className={styles["label"]}>
        Tempo
      </span>
      <div role="group" aria-labelledby={labelId} className={styles["tempo"]}>
        <IconButton
          icon="minus"
          label="Slower"
          size={38}
          className={styles["stepButton"]}
          disabled={bpm <= BPM_MIN}
          onClick={() => set(bpm - 1)}
        />
        <div className={styles["readout"]}>
          <input
            className={styles["bpmInput"]}
            inputMode="numeric"
            aria-label="Tempo in BPM"
            value={draft ?? String(bpm)}
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 3))}
            onFocus={(event) => event.target.select()}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
          <span className={styles["unit"]} aria-hidden="true">
            BPM
          </span>
        </div>
        <IconButton
          icon="plus"
          label="Faster"
          size={38}
          className={styles["stepButton"]}
          disabled={bpm >= BPM_MAX}
          onClick={() => set(bpm + 1)}
        />
        <Button className={styles["tapButton"]} aria-label="Tap tempo" onClick={tap}>
          Tap
        </Button>
      </div>
    </div>
  );
}
