import { findTrack, PARAM_SPECS } from "@phyllo/model";
import type { ParamName, Track } from "@phyllo/model";
import { modulatedParams } from "@phyllo/engine";
import { Fader, formatDb, gainToDb, dbToGain, Knob, Meter, Select, ToggleButton } from "@phyllo/ui";
import type { SelectOption } from "@phyllo/ui";
import { useMemo, type CSSProperties } from "react";
import { useMeters, useProject, useProjectSelector, useSelection } from "../../../hooks";
import { useTransportStopped } from "./useTransportStopped";
import { EffectMenu } from "./EffectMenu";
import { InsertList } from "./InsertList";
import { nextFreeOrbit, soundLine, trackInserts } from "./stripModel";
import { useFillHeight } from "./useFillHeight";
import styles from "./ChannelStrip.module.css";

const NEW_BUS = "new";
const BUS_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8];

interface SendProps {
  track: Track;
  param: Extract<ParamName, "room" | "delay">;
  label: string;
  modulated: boolean;
}

/** Space (`.room`) / Echo (`.delay`) send knob, 34 px in the track color. */
function SendKnob({ track, param, label, modulated }: SendProps) {
  const { dispatch, beginGesture, endGesture } = useProject();
  const spec = PARAM_SPECS[param];
  const raw = track.params[param];
  const patterned = typeof raw === "string";
  const value = typeof raw === "number" ? raw : (spec.default ?? 0);
  const locked = modulated || patterned;
  const shown = locked ? "~" : spec.format(value);
  return (
    <div className={styles["send"]}>
      <Knob
        size={34}
        value={spec.toKnob(value)}
        onChange={(position) => dispatch({ type: "track/setParam", trackId: track.id, param, value: spec.fromKnob(position) })}
        onChangeStart={beginGesture}
        onChangeEnd={endGesture}
        defaultValue={spec.toKnob(spec.default ?? 0)}
        label={`${track.name} ${label}`}
        valueText={locked ? `${label} driven by a pattern` : `${label} ${shown}`}
        color={track.color}
        modulated={locked}
        disabled={locked}
        title={locked ? `.${param}() is set by a pattern or modifier; edit it in the code or the inspector` : undefined}
      />
      <span className={styles["sendLabel"]}>{label}</span>
      <span className={styles["sendCode"]}>
        .{param} {shown}
      </span>
    </div>
  );
}

/** One track's strip: inserts, sends, bus, gain fader + meter, M/S. */
export function TrackStrip({ trackId }: { trackId: string }) {
  const track = useProjectSelector((p) => findTrack(p, trackId));
  const newOrbit = useProjectSelector((p) => nextFreeOrbit(p));
  const { dispatch, beginGesture, endGesture } = useProject();
  const { trackId: selectedId, select } = useSelection();
  const { meterFor } = useMeters();
  const stopped = useTransportStopped();
  const [area, faderHeight] = useFillHeight<HTMLDivElement>();
  const inserts = useMemo(() => (track ? trackInserts(track) : []), [track]);
  const modulated = useMemo(() => (track ? modulatedParams(track) : new Set<ParamName>()), [track]);

  if (!track) return null;
  const selected = selectedId === track.id;
  const gain = track.params.gain;
  const gainLocked = typeof gain === "string" || modulated.has("gain");
  const db = gainToDb(typeof gain === "number" ? gain : (PARAM_SPECS.gain.default ?? 0.8));

  const orbitOptions: SelectOption<string>[] = [
    ...[...new Set([...BUS_CHOICES, track.orbit])].sort((a, b) => a - b).map((o) => ({ value: String(o), label: `orbit ${o}` })),
    { value: NEW_BUS, label: `New bus (orbit ${newOrbit})` },
  ];

  return (
    <section
      className={styles["strip"]}
      data-kind="track"
      data-selected={selected ? "" : undefined}
      data-muted={track.mute ? "" : undefined}
      data-strip=""
      aria-label={`${track.name} channel`}
      style={{ "--strip-color": track.color } as CSSProperties}
    >
      <div className={styles["bar"]} aria-hidden="true" />
      <button type="button" className={styles["head"]} aria-pressed={selected} onClick={() => select(track.id)}>
        <span className={styles["name"]}>{track.name}</span>
        <span className={styles["sub"]}>{soundLine(track)}</span>
      </button>

      <div className={styles["list"]}>
        <span className={styles["legend"]} id={`${track.id}-inserts`}>
          Inserts
        </span>
        <InsertList track={track} items={inserts} labelledBy={`${track.id}-inserts`} />
        {track.kind !== "code" && <EffectMenu track={track} />}
      </div>

      <div className={styles["sends"]}>
        <SendKnob track={track} param="room" label="Space" modulated={modulated.has("room")} />
        <SendKnob track={track} param="delay" label="Echo" modulated={modulated.has("delay")} />
      </div>

      <Select
        className={styles["route"]}
        size="sm"
        label="Bus"
        labelPosition="inline"
        value={String(track.orbit)}
        options={orbitOptions}
        onChange={(value) => {
          const orbit = value === NEW_BUS ? newOrbit : Number(value);
          dispatch({ type: "track/setOrbit", trackId: track.id, orbit });
        }}
        aria-label={`${track.name} bus`}
      />

      <div className={styles["faderArea"]} ref={area}>
        <Fader
          db={db}
          onChange={(next) => dispatch({ type: "track/setParam", trackId: track.id, param: "gain", value: dbToGain(next) })}
          onChangeStart={beginGesture}
          onChangeEnd={endGesture}
          defaultDb={0}
          label={`${track.name} volume`}
          height={faderHeight}
          disabled={gainLocked}
          aria-describedby={gainLocked ? `${track.id}-gain-note` : undefined}
        />
        <Meter className={styles["meter"]} subscribe={meterFor(track.id)} stopped={stopped} stereo length={faderHeight} thickness={6} />
      </div>
      <div className={styles["db"]}>{gainLocked ? "pattern" : formatDb(db)}</div>
      {gainLocked && (
        <p className={styles["note"]} id={`${track.id}-gain-note`}>
          Volume follows a pattern; edit <code>.gain()</code> in the code.
        </p>
      )}

      <div className={styles["buttons"]}>
        <ToggleButton
          kind="mute"
          size={30}
          fullWidth
          pressed={track.mute}
          label={`Mute ${track.name}`}
          onChange={(mute) => dispatch({ type: "track/setMute", trackId: track.id, mute })}
        />
        <ToggleButton
          kind="solo"
          size={30}
          fullWidth
          pressed={track.solo}
          label={`Solo ${track.name}`}
          onChange={(solo) => dispatch({ type: "track/setSolo", trackId: track.id, solo })}
        />
      </div>
    </section>
  );
}
