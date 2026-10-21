import { useRef } from "react";
import type { KeyboardEvent } from "react";
import styles from "./ExportDialog.module.css";

export interface ChoiceCard<K extends string> {
  kind: K;
  label: string;
  sub: string;
  disabled: boolean;
}

export interface RangeCardsProps<K extends string> {
  cards: ChoiceCard<K>[];
  value: K;
  onChange(kind: K): void;
  /** Visible group label ("What to export"). */
  label: string;
  id: string;
}

/** Radio cards (roving focus: arrows move and select, skipping disabled cards). */
export function RangeCards<K extends string>({ cards, value, onChange, label, id }: RangeCardsProps<K>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = `${id}-label`;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    for (let i = 1; i <= cards.length; i++) {
      const next = (index + step * i + cards.length * i) % cards.length;
      const card = cards[next];
      if (card && !card.disabled) {
        onChange(card.kind);
        refs.current[next]?.focus();
        return;
      }
    }
  }

  return (
    <div className={styles["group"]}>
      <span id={labelId} className={styles["groupLabel"]}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={styles["cards"]} data-range-group="">
        {cards.map((card, index) => {
          const checked = card.kind === value;
          return (
            <button
              key={card.kind}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={card.disabled}
              className={styles["card"]}
              data-checked={checked ? "" : undefined}
              onClick={() => onChange(card.kind)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span className={styles["cardLabel"]}>{card.label}</span>
              <span className={styles["cardSub"]}>{card.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
