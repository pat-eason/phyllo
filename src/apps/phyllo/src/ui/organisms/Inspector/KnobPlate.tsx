import { GUIDED_KNOBS, PARAM_SPECS, PRO_KNOBS, formatNumber } from "@phyllo/model";
import type { ParamName, Settings, Track, UiMode } from "@phyllo/model";
import { modulatedParams, modulationRange } from "@phyllo/engine";
import { Button, ParamKnob, Surface, TextField } from "@phyllo/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useContextMenuTrigger } from "../../../hooks";
import { knobMenuEntries } from "./inspectorMenus";
import { useTipHighlight } from "./useTipHighlight";
import { ccFor, modifiersSetting, parseTypedValue } from "./inspectorModel";
import type { InspectorActions } from "./useInspectorActions";
import styles from "./Inspector.module.css";

export interface KnobPlateProps {
  track: Track;
  mode: UiMode;
  ccMap: Settings["midi"]["ccMap"];
  actions: InspectorActions;
}

interface Pending {
  param: ParamName;
  value: number;
}

/**
 * "Shape the sound" (Guided, 3×2) / "Parameters" (Pro, 4×2) on a recessed plate. Turning a modulated or patterned
 * knob doesn't write anything until the inline "Replace …?" confirm says yes.
 */
export function KnobPlate({ track, mode, ccMap, actions }: KnobPlateProps) {
  const guided = mode === "guided";
  const params = guided ? GUIDED_KNOBS : PRO_KNOBS;
  const modulated = modulatedParams(track);
  const [editing, setEditing] = useState<ParamName | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const headingId = useId();

  const needsConfirm = (p: ParamName) => modulated.has(p) || typeof track.params[p] === "string";

  function request(param: ParamName, value: number) {
    if (needsConfirm(param)) setPending({ param, value });
    else actions.setParam(param, value);
  }

  function confirmReplace() {
    if (!pending) return;
    actions.replaceModulation(pending.param, pending.value, modifiersSetting(track, pending.param));
    setPending(null);
  }

  return (
    <section className={styles["section"]} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles["legend"]}>
        {guided ? "Shape the sound" : "Parameters"}
      </h3>
      <Surface material="plate" padded={false} className={styles["plate"]} data-columns={guided ? 3 : 4}>
        {params.map((p) => (
          <KnobCell
            key={p}
            param={p}
            track={track}
            mode={mode}
            modulated={modulated.has(p)}
            cc={ccFor(ccMap, p)}
            editing={editing === p}
            onRequest={(v) => request(p, v)}
            onReset={() => actions.setParam(p, null)}
            onRemoveModulation={() => actions.disableModifiers(modifiersSetting(track, p))}
            onStartEdit={() => setEditing(p)}
            onStopEdit={() => setEditing(null)}
            onGestureStart={actions.beginGesture}
            onGestureEnd={actions.endGesture}
          />
        ))}
      </Surface>
      {pending ? (
        <ReplaceConfirm
          what={typeof track.params[pending.param] === "string" && !modulated.has(pending.param) ? "pattern" : "modulation"}
          label={guided ? PARAM_SPECS[pending.param].guidedLabel : pending.param}
          valueText={PARAM_SPECS[pending.param].format(pending.value, mode)}
          onConfirm={confirmReplace}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </section>
  );
}

interface KnobCellProps {
  param: ParamName;
  track: Track;
  mode: UiMode;
  modulated: boolean;
  cc: number | null;
  editing: boolean;
  onRequest: (value: number) => void;
  onReset: () => void;
  onRemoveModulation: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}

function KnobCell({ param, track, mode, modulated, cc, editing, onRequest, onReset, onRemoveModulation, onStartEdit, onStopEdit, onGestureStart, onGestureEnd }: KnobCellProps) {
  const spec = PARAM_SPECS[param];
  const value = track.params[param];
  const range = modulated ? modulationRange(track, param) : null;
  const knob = useRef<HTMLDivElement | null>(null);
  const guided = mode === "guided";
  const tipTarget = param === "lpf" ? "inspector-knob-lpf" : undefined;
  const highlighted = useTipHighlight(tipTarget);
  // While the typed-value field is open it keeps the browser's own text menu.
  const menu = useContextMenuTrigger(() =>
    editing
      ? null
      : {
          label: `${spec.guidedLabel} knob`,
          entries: knobMenuEntries(
            { hasValue: value !== undefined, drivers: modulated ? modifiersSetting(track, param) : [] },
            { reset: onReset, typeValue: onStartEdit, removeModulation: onRemoveModulation },
          ),
          returnFocus: knob.current,
        },
  );

  let valueText: string;
  if (typeof value === "string") valueText = `patterned ${value}`;
  else if (modulated) valueText = range ? `modulated ${range}` : "modulated";
  else valueText = spec.format(value, mode);
  // SPEC §8: the spoken value carries the label too ("Brightness 1.6k Hz"); the visible caption stays the bare value.
  const spoken = `${spec.guidedLabel} ${valueText}`;
  const visibleValue = typeof value === "string" ? value : modulated && range ? range : spec.format(typeof value === "number" ? value : null, mode);
  // The CC badge rides in the caption line; the default caption (Guided `.lpf()`, Pro value) is kept next to it.
  const defaultCaption = guided ? `.${param}()` : visibleValue;
  // Pro's `valueText` is the spoken form, so its visible caption is always passed (hidden from readers: the value is spoken).
  const caption =
    guided && cc === null ? undefined : (
      <>
        <span aria-hidden={guided ? undefined : true}>{defaultCaption}</span>
        {cc !== null ? (
          <span className={styles["ccBadge"]} title={`MIDI CC ${cc} controls ${spec.guidedLabel}`}>
            CC {cc}
          </span>
        ) : null}
      </>
    );

  return (
    <div className={styles["knobCell"]} {...menu}>
      <ParamKnob
        ref={knob}
        param={param}
        spec={spec}
        value={value}
        mode={mode}
        modulated={modulated}
        modulationText={range ?? undefined}
        valueText={spoken}
        caption={caption}
        onChange={onRequest}
        onBlockedChange={(_direction, next) => onRequest(next)}
        onChangeStart={onGestureStart}
        onChangeEnd={onGestureEnd}
        onRequestEdit={onStartEdit}
        // Double-click resets to "unset" (codegen omits the call), not to the knob's resting position.
        onDoubleClickCapture={(event) => {
          event.preventDefault();
          if (value !== undefined) onReset();
        }}
        data-tip-target={tipTarget}
        data-tip-highlight={highlighted ? "" : undefined}
        className={styles["paramKnob"]}
      />
      {editing ? (
        <ValueEntry
          label={`${spec.guidedLabel} (${param}) value${spec.unit ? ` in ${spec.unit}` : ""}, ${formatNumber(spec.min)} to ${formatNumber(spec.max)}`}
          unit={spec.unit}
          initial={typeof value === "number" ? String(value) : spec.default !== null ? String(spec.default) : ""}
          onCommit={(v) => {
            onStopEdit();
            onRequest(v);
            knob.current?.focus();
          }}
          onCancel={() => {
            onStopEdit();
            knob.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

interface ValueEntryProps {
  label: string;
  unit: string;
  initial: string;
  onCommit: (value: number) => void;
  onCancel: () => void;
}

/** ⌥-click / Enter on a knob: type a value in real units. Enter commits, Escape or blur cancels. */
function ValueEntry({ label, unit, initial, onCommit, onCancel }: ValueEntryProps) {
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <div className={styles["valueEntry"]}>
      <TextField
        ref={input}
        label={label}
        value={text}
        inputMode="decimal"
        trailing={unit ? <span className={styles["unit"]}>{unit}</span> : undefined}
        invalid={invalid}
        className={styles["valueField"]}
        onChange={(t) => {
          setText(t);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const v = parseTypedValue(text);
            if (v === null) setInvalid(true);
            else onCommit(v);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        onBlur={onCancel}
      />
    </div>
  );
}

interface ReplaceConfirmProps {
  what: "modulation" | "pattern";
  label: string;
  valueText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ReplaceConfirm({ what, label, valueText, onConfirm, onCancel }: ReplaceConfirmProps) {
  const textId = useId();
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <div role="group" aria-labelledby={textId} className={styles["confirm"]}>
      <p id={textId} className={styles["confirmText"]} aria-live="polite">
        Replace the {what} with a fixed value? <span className={styles["confirmValue"]}>{label} → {valueText}</span>
      </p>
      <div className={styles["confirmActions"]}>
        <Button size="sm" variant="ghost" onClick={onCancel} onKeyDown={escape}>
          Keep {what}
        </Button>
        <Button size="sm" variant="primary" onClick={onConfirm} onKeyDown={escape}>
          Replace
        </Button>
      </div>
    </div>
  );
}
