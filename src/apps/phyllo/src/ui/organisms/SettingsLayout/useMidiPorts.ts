import { useCallback, useEffect, useState } from "react";
import { useNative } from "../../../hooks";
import type { MidiPortInfo } from "../../../native/types";

export interface MidiPorts {
  ports: MidiPortInfo[];
  /** First enumeration finished (an empty list before that doesn't mean "no devices"). */
  loaded: boolean;
  rescanning: boolean;
  rescan(): Promise<void>;
}

/** MIDI ports from the native layer, kept live through `onMidiPortsChanged` (hot-plug). */
export function useMidiPorts(): MidiPorts {
  const native = useNative();
  const [ports, setPorts] = useState<MidiPortInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  useEffect(() => {
    let current = true;
    let off: (() => void) | undefined;
    native
      .midiListPorts()
      .then((list) => {
        if (current) setPorts(list);
      })
      .catch(() => {
        // No MIDI in this environment: the table shows its empty state.
      })
      .finally(() => {
        if (current) setLoaded(true);
      });
    native
      .onMidiPortsChanged((list) => {
        if (current) setPorts(list);
      })
      .then((unsubscribe) => {
        if (current) off = unsubscribe;
        else unsubscribe();
      })
      .catch(() => {
        // Hot-plug updates are unavailable; Rescan still works.
      });
    return () => {
      current = false;
      off?.();
    };
  }, [native]);

  const rescan = useCallback(async () => {
    setRescanning(true);
    try {
      setPorts(await native.midiRescan());
    } catch {
      // Keep the current list.
    } finally {
      setRescanning(false);
    }
  }, [native]);

  return { ports, loaded, rescanning, rescan };
}
