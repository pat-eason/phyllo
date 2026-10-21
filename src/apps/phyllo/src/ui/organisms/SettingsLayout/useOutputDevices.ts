import type { OutputDevice } from "@phyllo/engine";
import { useEffect, useState } from "react";
import { useAppStores } from "../../../hooks";

export interface OutputDevices {
  /** Real devices (the "default" aliases are dropped: the System default option stands for them). */
  devices: OutputDevice[];
  /** False when the web view can't route audio to a chosen device (no `AudioContext.setSinkId`) or lists none. */
  canSwitch: boolean;
}

const ALIAS_IDS = new Set(["default", "communications", ""]);

function supportsSinkId(): boolean {
  return typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
}

/**
 * Output devices from the engine (`listOutputDevices` needs no audio context, so this is safe in the Settings
 * window before any gesture). The engine instance comes from the host, which creates it lazily.
 */
export function useOutputDevices(): OutputDevices {
  const { engineHost } = useAppStores();
  const [devices, setDevices] = useState<OutputDevice[]>([]);

  useEffect(() => {
    let current = true;
    engineHost
      .get()
      .listOutputDevices()
      .then((list) => {
        if (current) setDevices(list.filter((device) => !ALIAS_IDS.has(device.id)));
      })
      .catch(() => {
        // Enumeration can be refused (permissions, unsupported web view): the System default option stays.
        if (current) setDevices([]);
      });
    return () => {
      current = false;
    };
  }, [engineHost]);

  return { devices, canSwitch: supportsSinkId() && devices.length > 0 };
}
