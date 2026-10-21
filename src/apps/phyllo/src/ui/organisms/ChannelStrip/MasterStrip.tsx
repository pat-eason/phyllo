import type { OutputDevice } from "@phyllo/engine";
import { formatNumber } from "@phyllo/model";
import { Button, dbToGain, Fader, formatDb, gainToDb, Meter, Select, Switch, Toast } from "@phyllo/ui";
import type { SelectOption } from "@phyllo/ui";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStores, useEngine, useMeters, useNative, useProject, useProjectFile, useProjectSelector, useSettings } from "../../../hooks";
import { nextTakeFileName, startOutputRecording } from "./recordOutput";
import type { OutputRecording } from "./recordOutput";
import { formatElapsed } from "./stripModel";
import { useFillHeight } from "./useFillHeight";
import styles from "./ChannelStrip.module.css";

/** How long the peak readout holds its highest value. */
const PEAK_HOLD_MS = 1500;

type RecordStatus = { kind: "idle" } | { kind: "starting" } | { kind: "recording"; startedAt: number } | { kind: "saving" };

interface ToastState {
  title: string;
  detail?: string;
  path?: string;
  tone: "neutral" | "error";
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Keeps the engine's master limiter in step with `project.master.limiter` (V10; the state layer doesn't apply it). */
function useLimiterSync(limiter: boolean) {
  const { engineHost } = useAppStores();
  useEffect(() => engineHost.onCreate((engine) => engine.setLimiter(limiter)), [engineHost, limiter]);
}

/** Output devices from the engine (`AudioContext.setSinkId` targets). */
function useOutputDevices(): OutputDevice[] {
  const { engineHost } = useAppStores();
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  useEffect(() => {
    let live = true;
    engineHost
      .get()
      .listOutputDevices()
      .then((list) => {
        if (live) setDevices(list);
      })
      .catch(() => {
        // Device listing isn't supported here: the select keeps "System default" only.
        if (live) setDevices([]);
      });
    return () => {
      live = false;
    };
  }, [engineHost]);
  return devices;
}

/** Peak readout with hold, written straight to the DOM from the master meter feed. */
function PeakReadout() {
  const { masterMeter } = useMeters();
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let held = 0;
    let heldAt = 0;
    let shown = "";
    return masterMeter((left, right) => {
      const peak = Math.max(left, right ?? left);
      const now = performance.now();
      if (peak >= held || now - heldAt > PEAK_HOLD_MS) {
        held = peak;
        heldAt = now;
      }
      const next = formatDb(gainToDb(held));
      if (next !== shown && text.current) {
        shown = next;
        text.current.textContent = next;
      }
    });
  }, [masterMeter]);
  return (
    <div className={styles["routeRow"]}>
      <span>Peak</span>
      <span className={styles["routeValue"]} ref={text}>
        −∞ dB
      </span>
    </div>
  );
}

/** Elapsed recording time, ticking in the DOM without re-rendering. */
function Elapsed({ startedAt }: { startedAt: number }) {
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      if (text.current) text.current.textContent = formatElapsed(Date.now() - startedAt);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <span ref={text}>0:00</span>;
}

/** The master strip: output device, postgain, limiter, rate, peak, and "● Rec output". */
export function MasterStrip() {
  const master = useProjectSelector((p) => p.master);
  const { dispatch, beginGesture, endGesture } = useProject();
  const { projectName } = useProjectFile();
  const { settings, set } = useSettings();
  const { ensureAudio, audioReady } = useEngine();
  const { masterMeter } = useMeters();
  const { engineHost } = useAppStores();
  const native = useNative();
  const devices = useOutputDevices();
  useLimiterSync(master.limiter);
  const [area, faderHeight] = useFillHeight<HTMLDivElement>();

  const [status, setStatus] = useState<RecordStatus>({ kind: "idle" });
  const [toast, setToast] = useState<ToastState | null>(null);
  const session = useRef<OutputRecording | null>(null);
  const busy = useRef(false);

  useEffect(
    () => () => {
      void session.current?.cancel();
      session.current = null;
    },
    [],
  );

  const deviceOptions: SelectOption<string>[] = [
    { value: "", label: "System default" },
    ...devices.filter((d) => d.id !== "default" && d.id !== "").map((d) => ({ value: d.id, label: d.label || d.id })),
  ];
  const device = settings.audio.outputDevice ?? "";
  if (device !== "" && !deviceOptions.some((o) => o.value === device)) deviceOptions.push({ value: device, label: device });

  const rate = (audioReady ? engineHost.peek()?.sampleRate : undefined) || settings.audio.sampleRate || 0;
  const db = gainToDb(master.postgain);

  const startRecording = () => {
    busy.current = true;
    setStatus({ kind: "starting" });
    const fileName = nextTakeFileName(projectName);
    ensureAudio()
      .then(() => startOutputRecording({ engine: engineHost.get(), native, fileName }))
      .then((recording) => {
        session.current = recording;
        setStatus({ kind: "recording", startedAt: recording.startedAt });
      })
      .catch((error: unknown) => {
        setStatus({ kind: "idle" });
        setToast({ title: "Couldn't record the output", detail: messageOf(error), tone: "error" });
      })
      .finally(() => {
        busy.current = false;
      });
  };

  const stopRecording = (recording: OutputRecording) => {
    busy.current = true;
    session.current = null;
    setStatus({ kind: "saving" });
    recording
      .stop()
      .then((result) => {
        setToast({
          title: `Saved ${baseName(result.path)}`,
          detail: `${formatElapsed(result.durationSec * 1000)} · 24-bit WAV`,
          path: result.path,
          tone: "neutral",
        });
      })
      .catch((error: unknown) => {
        setToast({ title: "Couldn't save the recording", detail: messageOf(error), tone: "error" });
      })
      .finally(() => {
        busy.current = false;
        setStatus({ kind: "idle" });
      });
  };

  const onRecord = () => {
    if (busy.current) return;
    if (session.current) stopRecording(session.current);
    else startRecording();
  };

  const recording = status.kind === "recording";

  return (
    <section className={styles["strip"]} data-kind="master" data-strip="" aria-label="Master channel">
      <div className={styles["bar"]} aria-hidden="true" />
      <div className={styles["head"]}>
        <span className={styles["name"]}>Master</span>
        <Select
          className={styles["device"]}
          size="sm"
          label="Output device"
          labelPosition="hidden"
          value={device}
          options={deviceOptions}
          onChange={(value) => set("audio", { outputDevice: value === "" ? null : value })}
        />
      </div>

      <div className={styles["list"]}>
        <span className={styles["legend"]}>Output</span>
        <ul className={styles["inserts"]} aria-label="Master output">
          <li className={styles["insert"]} title={master.postgain === 1 ? "No postgain (1)" : `all(x => x.postgain(${formatNumber(master.postgain, 2)}))`}>
            <span>postgain</span>
            <span className={styles["insertValue"]}>{formatNumber(master.postgain, 2)}</span>
          </li>
          <li className={styles["insert"]}>
            <span aria-hidden="true">limiter</span>
            <Switch
              size="sm"
              checked={master.limiter}
              label="Limiter"
              onChange={(limiter) => dispatch({ type: "master/set", patch: { limiter } })}
            />
          </li>
          <li className={styles["insert"]}>
            <span>rate</span>
            <span className={styles["insertValue"]}>{rate > 0 ? `${formatNumber(rate / 1000, 1)} kHz` : "—"}</span>
          </li>
        </ul>
      </div>

      <PeakReadout />

      <div className={styles["faderArea"]} ref={area}>
        <Fader
          db={db}
          onChange={(next) => dispatch({ type: "master/set", patch: { postgain: Math.round(dbToGain(next) * 1000) / 1000 } })}
          onChangeStart={beginGesture}
          onChangeEnd={endGesture}
          defaultDb={0}
          label="Master volume"
          height={faderHeight}
        />
        <Meter className={styles["meter"]} subscribe={masterMeter} stereo length={faderHeight} thickness={6} hold />
      </div>
      <div className={styles["db"]}>{formatDb(db)}</div>

      <div className={styles["buttons"]}>
        <Button
          variant="secondary"
          size="sm"
          className={styles["rec"]}
          data-recording={recording ? "" : undefined}
          aria-label={recording ? "Stop recording the master output" : "Record master output to a file"}
          loading={status.kind === "starting" || status.kind === "saving"}
          onClick={onRecord}
        >
          {status.kind === "recording" ? (
            <>
              <span aria-hidden="true">■</span> Stop <Elapsed startedAt={status.startedAt} />
            </>
          ) : (
            <>
              <span aria-hidden="true">●</span> Rec output
            </>
          )}
        </Button>
      </div>

      {toast &&
        createPortal(
          <Toast
            className={styles["toast"]}
            title={toast.title}
            {...(toast.detail ? { detail: toast.detail } : {})}
            tone={toast.tone}
            duration={toast.tone === "error" ? 0 : 6000}
            {...(toast.path
              ? {
                  action: {
                    label: "Reveal",
                    onClick: () => {
                      const path = toast.path;
                      if (path) native.revealInFinder(path).catch(() => setToast({ title: "Couldn't show the file", detail: path, tone: "error" }));
                    },
                  },
                }
              : {})}
            onDismiss={() => setToast(null)}
          />,
          document.body,
        )}
    </section>
  );
}
