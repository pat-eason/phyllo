import { Icon, Toast } from "@phyllo/ui";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useAppStores, useExport, useNative, useProject } from "../../../hooks";
import type { ExportJobResult, ExportOptions } from "../../../state/exportPipeline";
import { FORMAT_EXT } from "../../../state/exportPipeline";
import { AudioPane, CodePane, MidiPane } from "./ExportPanes";
import {
  DEFAULT_AUDIO_FORM,
  DEFAULT_CODE_FORM,
  DEFAULT_MIDI_FORM,
  FORMAT_NAME,
  TABS,
  audioEstimate,
  audioOptions,
  audioPath,
  audioProblem,
  defaultFilePath,
  pathProblem,
  stemTrackIds,
  stemsFolder,
} from "./exportForm";
import type { AudioForm, CodeForm, ExportTab, FormContext, MidiForm } from "./exportForm";
import { JobFooter } from "./JobFooter";
import styles from "./ExportDialog.module.css";

export interface ExportDialogProps {
  /** Shows the modal. A running export keeps going while closed; its result then shows as a Toast. */
  open: boolean;
  /** Escape (when no export is running), Cancel, Done and "Keep working". Focus returns to the opener. */
  onClose(): void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** The exports folder (`~/Music/Phyllo/Exports`), fetched once from the native layer. */
function useExportsDir(): string {
  const native = useNative();
  const [dir, setDir] = useState("");
  useEffect(() => {
    let live = true;
    native.getPaths().then(
      (paths) => {
        if (live) setDir(paths.exports);
      },
      () => {
        if (live) setDir("Exports");
      },
    );
    return () => {
      live = false;
    };
  }, [native]);
  return dir;
}

/**
 * SPEC §6.5 Export: Mixdown · Stems · MIDI · Code. A modal over the scrim with a focus trap; the job runs through
 * `useExport` (offline render → native encoder) and finishes with a Reveal action.
 */
export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { project } = useProject();
  const native = useNative();
  const stores = useAppStores();
  const job = useExport();
  const exportsDir = useExportsDir();
  const [tab, setTab] = useState<ExportTab>("mixdown");
  const [audio, setAudio] = useState<AudioForm>(DEFAULT_AUDIO_FORM);
  const [midi, setMidi] = useState<MidiForm>(DEFAULT_MIDI_FORM);
  const [code, setCode] = useState<CodeForm>(DEFAULT_CODE_FORM);
  const [seenResult, setSeenResult] = useState<ExportJobResult | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const busy = job.state === "rendering" || job.state === "encoding";
  const ctx: FormContext = { project, exportsDir, nativeKind: native.kind };
  const deviceRate = stores.engineHost.peek()?.sampleRate || 48000;

  // Focus: first the range group (doc), back to the opener on close.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const first =
      dialog?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  const close = () => {
    if (job.state === "done" && job.result) setSeenResult(job.result);
    onClose();
  };

  const midiPath = midi.path ?? defaultFilePath(exportsDir, project, "mid");
  const codePath = code.path ?? defaultFilePath(exportsDir, project, "strudel");

  let problem: string | null;
  let exportLabel: string;
  let workLabel = "Rendering the song";
  let options: () => ExportOptions;
  if (tab === "mixdown" || tab === "stems") {
    problem = audioProblem(tab, audio, ctx);
    const count = stemTrackIds(audio, project).length;
    exportLabel = tab === "mixdown" ? `Export ${FORMAT_NAME[audio.format]}` : `Export ${count} ${count === 1 ? "stem" : "stems"}`;
    if (tab === "stems") workLabel = "Rendering stems";
    options = () => audioOptions(tab, audio, ctx);
  } else if (tab === "midi") {
    problem = pathProblem(midiPath);
    exportLabel = "Export MIDI";
    workLabel = "Reading the notes";
    options = () => ({ kind: "midi", range: midi.range, layout: midi.layout, path: midiPath.trim() });
  } else {
    problem = code.action === "file" ? pathProblem(codePath) : null;
    exportLabel = code.action === "file" ? "Save .strudel" : "Copy link";
    workLabel = "Writing the code";
    const section = project.sections.find((s) => s.id === code.scope);
    options = () => ({
      kind: "code",
      action: code.action,
      scope: section ? "section" : "song",
      ...(section ? { sectionBar: section.startBar } : {}),
      ...(code.action === "file" ? { path: codePath.trim() } : {}),
    });
  }
  if (!exportsDir && problem === null && tab !== "code") problem = "Looking up the exports folder…";

  const switchTab = (next: ExportTab) => {
    if (busy || next === tab) return;
    if (job.state === "done" || job.state === "error") job.reset();
    setTab(next);
  };

  async function choose() {
    if (tab === "stems") {
      const picked = await native.openDialog({ title: "Choose a folder for the stems", directory: true, defaultPath: stemsFolder(audio, exportsDir) });
      if (typeof picked === "string") setAudio((f) => ({ ...f, folder: picked }));
      return;
    }
    const spec =
      tab === "mixdown"
        ? { path: audioPath(audio, exportsDir, project), name: `${FORMAT_NAME[audio.format]} audio`, ext: FORMAT_EXT[audio.format] }
        : tab === "midi"
          ? { path: midiPath, name: "MIDI file", ext: "mid" }
          : { path: codePath, name: "Strudel code", ext: "strudel" };
    const picked = await native.saveDialog({ title: "Export", defaultPath: spec.path, filters: [{ name: spec.name, extensions: [spec.ext] }] });
    if (!picked) return;
    if (tab === "mixdown") setAudio((f) => ({ ...f, path: picked }));
    else if (tab === "midi") setMidi((f) => ({ ...f, path: picked }));
    else setCode((f) => ({ ...f, path: picked }));
  }

  const reveal = (path: string) => {
    native.revealInFinder(path).catch(() => undefined);
  };

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      if (event.defaultPrevented || busy) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.tabIndex >= 0);
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (!firstItem || !lastItem) return;
    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
  }

  const info = infoNote(tab, audio, ctx, code.action);
  const toastResult = !open && job.state === "done" && job.result && job.result !== seenResult ? job.result : null;

  return (
    <>
      {open ? (
        <div className={styles["scrim"]}>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- modal focus trap + Escape */}
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            className={styles["dialog"]}
            onKeyDown={handleKeyDown}
          >
            <nav aria-label="Export type" className={styles["nav"]}>
              <h2 id="export-title" className={styles["title"]}>
                Export
              </h2>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={styles["tab"]}
                  aria-current={t.id === tab ? "page" : undefined}
                  disabled={busy && t.id !== tab}
                  onClick={() => switchTab(t.id)}
                >
                  <span className={styles["tabLabel"]}>{t.label}</span>
                  <span className={styles["tabSub"]}>{t.sub}</span>
                </button>
              ))}
            </nav>
            <div className={styles["pane"]}>
              <fieldset className={styles["form"]} disabled={busy} aria-label={TABS.find((t) => t.id === tab)?.label}>
                {tab === "mixdown" || tab === "stems" ? (
                  <AudioPane
                    tab={tab}
                    project={project}
                    form={audio}
                    onChange={setAudio}
                    exportsDir={exportsDir}
                    deviceRate={deviceRate}
                    onChoose={() => void choose()}
                  />
                ) : tab === "midi" ? (
                  <MidiPane project={project} form={midi} onChange={setMidi} path={midiPath} onChoose={() => void choose()} />
                ) : (
                  <CodePane project={project} form={code} onChange={setCode} path={codePath} onChoose={() => void choose()} />
                )}
              </fieldset>
              <JobFooter
                job={job}
                info={info}
                problem={problem}
                exportLabel={exportLabel}
                workLabel={workLabel}
                onExport={() => {
                  if (problem === null) job.start(options());
                }}
                onClose={close}
                onCancelJob={job.cancel}
                onReveal={reveal}
                onAgain={job.reset}
              />
            </div>
          </section>
        </div>
      ) : null}
      {toastResult ? (
        <div className={styles["toastSlot"]}>
          <Toast
            title={toastResult.title}
            detail={toastResult.detail}
            {...(toastResult.path ? { action: { label: "Reveal", onClick: () => reveal(toastResult.path ?? "") } } : {})}
            onDismiss={() => setSeenResult(toastResult)}
          />
        </div>
      ) : null}
    </>
  );
}

function infoNote(tab: ExportTab, audio: AudioForm, ctx: FormContext, codeAction: CodeForm["action"]) {
  let text;
  if (tab === "mixdown" || tab === "stems") {
    const { audio: length, wait, renders } = audioEstimate(tab, audio, ctx);
    text =
      tab === "mixdown" ? (
        <>
          Phyllo renders the song faster than real time; you can keep working. About <strong>{wait}</strong> for {length} of audio.
        </>
      ) : (
        <>
          Phyllo renders each track on its own, faster than real time; you can keep working. About <strong>{wait}</strong> for{" "}
          {renders} {renders === 1 ? "stem" : "stems"} of {length}.
        </>
      );
  } else if (tab === "midi") {
    text = <>MIDI export is instant: Phyllo reads the notes straight from the patterns. Drum tracks go to channel 10.</>;
  } else {
    text =
      codeAction === "file" ? (
        <>The .strudel file opens in Phyllo or pastes into strudel.cc as is.</>
      ) : (
        <>The link carries the whole program, so it works without an account. Long songs make long links.</>
      );
  }
  return (
    <div className={styles["info"]}>
      <Icon name="clock" size={16} className={styles["infoIcon"]} />
      <span>{text}</span>
    </div>
  );
}
