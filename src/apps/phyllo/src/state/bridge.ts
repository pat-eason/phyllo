import type { MidiOutMessage, NativeBridge, OscOutMessage } from "@phyllo/engine";
import type { NativeApi } from "../native/api";
import type { MidiPortInfo } from "../native/types";
import type { Unsubscribe } from "./feed";

export interface NativeBridgeHandle {
  bridge: NativeBridge;
  /** Re-read the port list (also kept current via `onMidiPortsChanged`). */
  refreshPorts(): Promise<void>;
  dispose(): void;
}

/**
 * The engine's `NativeBridge` (DECISIONS V12, D85) over the app's `NativeApi`: `.midi("<name>")` port names map
 * to native port ids (exact, then case-insensitive, then prefix match); `null` = the first enabled output in
 * Settings (else the first output). Outputs are opened on first use. Failures are reported once per port.
 */
export function createNativeBridge(
  native: NativeApi,
  enabledPorts: () => readonly string[],
  onError: (message: string, error: unknown) => void = () => {},
): NativeBridgeHandle {
  let outputs: MidiPortInfo[] = [];
  const opened = new Map<string, Promise<void>>();
  const reported = new Set<string>();
  let disposed = false;
  let unsubscribePorts: Unsubscribe | undefined;

  const setPorts = (ports: MidiPortInfo[]) => {
    outputs = ports.filter((p) => p.direction === "out");
    for (const id of [...opened.keys()]) if (!outputs.some((p) => p.id === id)) opened.delete(id);
  };

  const refreshPorts = async () => {
    try {
      setPorts(await native.midiListPorts());
    } catch (error) {
      onError("Couldn't list MIDI ports", error);
    }
  };
  // Lazy: nothing touches MIDI until a pattern actually sends (a Web MIDI permission prompt in Chromium).
  let readyPromise: Promise<void> | undefined;
  const ready = () => {
    if (!readyPromise) {
      readyPromise = refreshPorts();
      void native
        .onMidiPortsChanged(setPorts)
        .then((unsubscribe) => {
          if (disposed) unsubscribe();
          else unsubscribePorts = unsubscribe;
        })
        .catch(() => undefined);
    }
    return readyPromise;
  };

  const resolve = (portName: string | null): MidiPortInfo | undefined => {
    if (portName === null) {
      const enabled = enabledPorts();
      return outputs.find((p) => enabled.includes(p.id)) ?? outputs[0];
    }
    const lower = portName.toLowerCase();
    return (
      outputs.find((p) => p.name === portName) ??
      outputs.find((p) => p.name.toLowerCase() === lower) ??
      outputs.find((p) => p.name.toLowerCase().startsWith(lower))
    );
  };

  const reportOnce = (key: string, message: string, error: unknown) => {
    if (reported.has(key)) return;
    reported.add(key);
    onError(message, error);
  };

  const bridge: NativeBridge = {
    midiSend(portName: string | null, messages: MidiOutMessage[]) {
      void ready().then(async () => {
        const port = resolve(portName);
        if (!port) {
          reportOnce(`missing:${portName ?? ""}`, `No MIDI output "${portName ?? "default"}"`, null);
          return;
        }
        let open = opened.get(port.id);
        if (!open) {
          open = native.midiOpenOutput(port.id);
          opened.set(port.id, open);
        }
        try {
          await open;
          await native.midiSend(port.id, messages);
        } catch (error) {
          opened.delete(port.id);
          reportOnce(`send:${port.id}`, `MIDI output "${port.name}" failed`, error);
        }
      });
    },
    oscSend(messages: OscOutMessage[]) {
      native.oscSend(messages).catch((error: unknown) => reportOnce("osc", "OSC send failed", error));
    },
  };

  return {
    bridge,
    refreshPorts,
    dispose() {
      disposed = true;
      unsubscribePorts?.();
    },
  };
}
