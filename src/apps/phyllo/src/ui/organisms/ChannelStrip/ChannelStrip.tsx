import { BusStrip } from "./BusStrip";
import { MasterStrip } from "./MasterStrip";
import { TrackStrip } from "./TrackStrip";

export type ChannelStripProps = { kind: "track"; trackId: string } | { kind: "bus"; orbit: number } | { kind: "master" };

/**
 * One mixer strip (SPEC §6.4): a track (124 px: inserts, Space/Echo sends, bus, `.gain()` fader, M/S), a shared
 * orbit bus (132 px: `roomsize`/`delaytime`/`delayfb`, member count, orbit meter) or the master (150 px: output
 * device, `postgain`, limiter, rate, peak, "● Rec output"). Meters and the peak readout write to the DOM directly.
 */
export function ChannelStrip(props: ChannelStripProps) {
  switch (props.kind) {
    case "track":
      return <TrackStrip trackId={props.trackId} />;
    case "bus":
      return <BusStrip orbit={props.orbit} />;
    case "master":
      return <MasterStrip />;
    default: {
      const never: never = props;
      return never;
    }
  }
}
