import { PARAM_SPECS } from "@phyllo/model";
import type { Bus } from "@phyllo/model";
import { Knob, Meter, ToggleButton } from "@phyllo/ui";
import { useAppStores, useContextMenuTrigger, useProject, useProjectSelector, useMeters } from "../../../hooks";
import { useTransportStopped } from "./useTransportStopped";
import { busMenuEntries } from "./stripMenus";
import { insertLabel } from "./stripModel";
import { useFillHeight } from "./useFillHeight";
import styles from "./ChannelStrip.module.css";

const BUS_PARAMS = ["roomsize", "delaytime", "delayfeedback"] as const;
type BusParam = (typeof BUS_PARAMS)[number];

function BusKnob({ orbit, param, value }: { orbit: number; param: BusParam; value: number | undefined }) {
  const { dispatch, beginGesture, endGesture } = useProject();
  const spec = PARAM_SPECS[param];
  const text = spec.format(value ?? null);
  const label = insertLabel(param);
  return (
    <div className={styles["busKnob"]}>
      <Knob
        size={34}
        value={spec.toKnob(value ?? null)}
        onChange={(position) => dispatch({ type: "bus/set", orbit, patch: { [param]: spec.fromKnob(position) } })}
        onChangeStart={beginGesture}
        onChangeEnd={endGesture}
        label={`Bus ${orbit} ${label}`}
        valueText={text}
      />
      <span className={styles["busKnobText"]}>
        <span>{label}</span>
        <span className={styles["insertValue"]}>{text}</span>
      </span>
    </div>
  );
}

/** One orbit's shared reverb/delay settings (SPEC §6.4 bus strip). */
export function BusStrip({ orbit }: { orbit: number }) {
  const bus = useProjectSelector((p): Bus | undefined => p.buses.find((b) => b.orbit === orbit));
  const members = useProjectSelector((p) => p.tracks.filter((t) => t.orbit === orbit).map((t) => t.id));
  const allMuted = useProjectSelector((p) => {
    const tracks = p.tracks.filter((t) => t.orbit === orbit);
    return tracks.length > 0 && tracks.every((t) => t.mute);
  });
  const { dispatch, beginGesture, endGesture } = useProject();
  const stores = useAppStores();
  const { orbitMeterFor } = useMeters();
  const stopped = useTransportStopped();
  const [area, meterHeight] = useFillHeight<HTMLDivElement>();
  const count = members.length;
  const legendId = `bus-${orbit}-shared`;
  const noteId = `bus-${orbit}-note`;

  const setMute = (mute: boolean) => {
    beginGesture();
    for (const trackId of members) dispatch({ type: "track/setMute", trackId, mute });
    endGesture();
  };

  const menu = useContextMenuTrigger(() => {
    const { project } = stores.project.getState();
    const memberTracks = project.tracks.filter((t) => t.orbit === orbit);
    const busValues = project.buses.find((b) => b.orbit === orbit);
    const soloed = memberTracks.length > 0 && project.tracks.every((t) => t.solo === (t.orbit === orbit));
    return {
      label: `Bus ${orbit}`,
      entries: busMenuEntries(
        {
          orbit,
          members: memberTracks.map((t) => ({ id: t.id, name: t.name })),
          allMuted: memberTracks.length > 0 && memberTracks.every((t) => t.mute),
          soloed,
          hasEffects: BUS_PARAMS.some((p) => busValues?.[p] !== undefined),
        },
        {
          setMute,
          setSolo(solo) {
            beginGesture();
            try {
              for (const t of project.tracks) {
                const next = solo && t.orbit === orbit;
                if (t.solo !== next) dispatch({ type: "track/setSolo", trackId: t.id, solo: next });
              }
            } finally {
              endGesture();
            }
          },
          selectTrack: (trackId) => dispatch({ type: "ui/select", trackId }),
          // `undefined` unsets the field on the bus (the reducer deletes it), so codegen omits the call again.
          resetEffects: () => dispatch({ type: "bus/set", orbit, patch: { roomsize: undefined, delaytime: undefined, delayfeedback: undefined } }),
        },
      ),
    };
  });

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Shift+F10 reaches the menu from the controls inside
    <section
      className={styles["strip"]}
      data-kind="bus"
      data-strip=""
      aria-label={`Bus ${orbit} channel`}
      aria-describedby={noteId}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <div className={styles["bar"]} aria-hidden="true" />
      <div className={styles["head"]}>
        <span className={styles["name"]}>Bus {orbit}</span>
        <span className={styles["sub"]}>orbit({orbit}) · shared</span>
      </div>

      <div className={styles["list"]}>
        <span className={styles["legend"]} id={legendId}>
          Shared by {count} {count === 1 ? "track" : "tracks"}
        </span>
        <div className={styles["busKnobs"]} role="group" aria-labelledby={legendId}>
          {BUS_PARAMS.map((param) => (
            <BusKnob key={param} orbit={orbit} param={param} value={bus?.[param]} />
          ))}
        </div>
        <p className={styles["note"]} id={noteId}>
          Tracks on the same orbit share one reverb and delay; changing the room size affects all of them.
        </p>
      </div>

      <div className={styles["routeRow"]}>
        <span>Out</span>
        <span className={styles["routeValue"]}>master</span>
      </div>

      <div className={styles["faderArea"]} ref={area}>
        <Meter className={styles["meter"]} subscribe={orbitMeterFor(orbit)} stopped={stopped} stereo length={meterHeight} thickness={6} />
      </div>

      <div className={styles["buttons"]}>
        <ToggleButton
          kind="mute"
          size={30}
          fullWidth
          pressed={allMuted}
          disabled={count === 0}
          label={`Mute bus ${orbit} (all ${count} ${count === 1 ? "track" : "tracks"})`}
          onChange={setMute}
        />
      </div>
    </section>
  );
}
