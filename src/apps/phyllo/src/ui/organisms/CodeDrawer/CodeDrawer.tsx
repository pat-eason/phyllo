import { generate, toShareUrl } from "@phyllo/engine";
import type { CodeScope } from "@phyllo/model";
import { Button, Icon, SegmentedControl } from "@phyllo/ui";
import type { SegmentedOption } from "@phyllo/ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { useStore } from "zustand";
import { useAppStores, useCodeDrawer, useEngine, useProject, useSelection, useTips, useUiMode } from "../../../hooks";
import {
  describeLines,
  errorBannerText,
  errorSummary,
  findPatternLiterals,
  guidedSummary,
  locateError,
  scopeSummary,
  sectionName,
} from "./codeModel";
import { useCodeEditorPrefs } from "../SettingsLayout";
import { navigate } from "../../shell/router";
import { CodeView } from "./CodeView";
import type { CodeViewError } from "./CodeView";
import { EditCodePanel } from "./EditCodePanel";
import { EvaluatedAgo } from "./EvaluatedAgo";
import { useResizableHeight } from "./useResizableHeight";
import styles from "./CodeDrawer.module.css";

/** Line height as a multiple of the editor font size (the 12 px default gives the design's 21 px rows). */
const CODE_LINE_HEIGHT = 1.75;

export interface CodeDrawerProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Starting height of the open code area in px; the user resizes it from the top edge. Default 196. */
  defaultHeight?: number;
}

type CopyState = "idle" | "copied" | "failed";
/** What the last copy put on the clipboard. */
type CopyKind = "link" | "code";

const DEFAULT_HEIGHT = 196;
const COPY_FEEDBACK_MS = 2500;
/** Tip step completed by sharing (TipCoach curriculum step 5). */
const SHARE_TIP_STEP = 5;

/**
 * Engines whose scope already got the Pro default ("This section", mockup 02) or a user's pick. Keyed by the
 * engine's stable `setScope`, so remounting the drawer (switching screens) never overrides the user's choice.
 */
const scopeDefaulted = new WeakSet<(scope: CodeScope) => void>();

/**
 * The always-available view of the Strudel code Phyllo generates (SPEC §6.1 "Code drawer"), pinned at the
 * bottom of the center column. Collapsed by default in Guided, open in Pro; the user's Show/Hide overrides that.
 * Open: scope switch, strudel.cc link, status, line-numbered colored code with the selected track highlighted,
 * inline engine errors, click-to-edit source patterns and (Pro) whole-song editing through the parser.
 */
export function CodeDrawer({ defaultHeight = DEFAULT_HEIGHT, className, ...rest }: CodeDrawerProps) {
  const id = useId();
  const bodyId = `${id}-body`;
  const { code, lineMap, scope, setScope, sectionBar, status } = useEngine();
  const { project, dispatch, applyCode } = useProject();
  const { open, toggle } = useCodeDrawer();
  const { mode } = useUiMode();
  const { trackId: selectedTrackId } = useSelection();
  const { complete } = useTips();
  const { height, handleProps } = useResizableHeight(defaultHeight);
  const { transport } = useAppStores();
  const playing = useStore(transport, (s) => s.playing);

  // Pro opens on "This section" (mockup 02); the engine store starts every consumer on the whole song.
  useEffect(() => {
    if (mode !== "pro" || scopeDefaulted.has(setScope)) return;
    scopeDefaulted.add(setScope);
    if (scope === "song") setScope("section");
  }, [mode, scope, setScope]);

  const chooseScope = (next: CodeScope) => {
    scopeDefaulted.add(setScope);
    setScope(next);
  };

  const [editSeed, setEditSeed] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [copyKind, setCopyKind] = useState<CopyKind>("link");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const editing = editSeed !== null && mode === "pro" && open;
  const lines = useMemo(() => describeLines(code, lineMap), [code, lineMap]);
  const literals = useMemo(() => findPatternLiterals(lines, project.tracks), [lines, project.tracks]);

  // Engine errors point into the evaluated whole-song program; map them onto what is shown.
  const errorLocation = useMemo(() => {
    if (!status.error) return null;
    const display = { lines: lines.map((l) => l.text), map: lineMap };
    if (scope === "song") return locateError(status.error, display, display);
    const song = generate(project, { scope: "song" });
    return locateError(status.error, display, { lines: song.code.split("\n"), map: song.lines });
  }, [status.error, lines, lineMap, scope, project]);
  const codeError: CodeViewError | null =
    status.error && errorLocation ? { location: errorLocation, message: status.error.message } : null;

  const section = sectionName(project, sectionBar);
  const scopeOptions: SegmentedOption<CodeScope>[] = [
    { value: "section", label: section ? `This section · ${section}` : "This section", disabled: editing },
    { value: "song", label: "Whole song · arrange()", disabled: editing },
  ];

  const copyToClipboard = async (kind: CopyKind, text: string) => {
    clearTimeout(copyTimer.current);
    setCopyKind(kind);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      if (kind === "link") complete(SHARE_TIP_STEP);
    } catch {
      // Clipboard access can be refused (permissions, unfocused window); say so instead of failing silently.
      setCopyState("failed");
    }
    copyTimer.current = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
  };
  const copyLink = () => copyToClipboard("link", toShareUrl(code));
  const copyCode = () => copyToClipboard("code", code);

  // Edit code always works on the whole song: `applyCode` replaces every track, so section code would drop the rest.
  const startEditing = () => {
    chooseScope("song");
    setEditSeed(generate(project, { scope: "song" }).code);
  };

  const errorBanner = status.error ? errorBannerText(status.error, project.tracks, errorLocation, open) : null;

  const summary =
    mode === "guided" && !open ? (
      guidedSummary(project.tracks, playing)
    ) : (
      <>
        {scopeSummary(project, scope, sectionBar)} · <EvaluatedAgo evaluatedAt={status.evaluatedAt} /> ·{" "}
        <span className={status.error ? styles["summaryError"] : undefined}>
          {errorSummary(status.error, project.tracks, errorLocation)}
        </span>
      </>
    );

  // The summary truncates when the header is tight (one row with the tools); hovering shows it whole.
  const summaryTitle =
    mode === "guided" && !open
      ? undefined
      : `${scopeSummary(project, scope, sectionBar)} · ${errorSummary(status.error, project.tracks, errorLocation)}`;
  const editorPrefs = useCodeEditorPrefs();
  const bodyStyle = {
    height,
    "--code-size": `${editorPrefs.fontSize}px`,
    "--code-line": `${Math.round(editorPrefs.fontSize * CODE_LINE_HEIGHT)}px`,
  } as CSSProperties;
  const classes = className ? `${styles["drawer"]} ${className}` : styles["drawer"];

  return (
    <section aria-label="Code" className={classes} data-open={open ? "" : undefined} {...rest}>
      {open ? <div className={styles["resizeHandle"]} aria-label="Resize code drawer" aria-controls={bodyId} {...handleProps} /> : null}
      <div className={styles["header"]}>
        <Icon name="code" size={16} className={styles["codeIcon"]} />
        <span className={styles["title"]}>Code</span>
        <span className={styles["summary"]} title={summaryTitle}>
          {summary}
        </span>
        {open ? (
          <div className={styles["tools"]}>
            <SegmentedControl label="Code scope" size="sm" options={scopeOptions} value={scope} onChange={chooseScope} />
            {mode === "pro" && !editing ? (
              <Button size="sm" variant="ghost" iconStart="draw" onClick={startEditing}>
                Edit code
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void copyLink()}>
              {copyState === "copied" && copyKind === "link" ? "Link copied" : "Copy strudel.cc link"}
            </Button>
          </div>
        ) : null}
        <Button size="sm" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          {open ? "Hide code" : "Show code"}
        </Button>
      </div>
      <div className={styles["messages"]} aria-live="polite">
        {errorBanner ? <p className={styles["errorBanner"]}>{errorBanner}</p> : null}
        {copyState === "copied" ? (
          <p className={styles["visuallyHidden"]}>{copyKind === "link" ? "strudel.cc link copied to the clipboard" : "Code copied to the clipboard"}</p>
        ) : null}
        {copyState === "failed" ? (
          <p className={styles["errorBanner"]}>Couldn&apos;t copy the {copyKind === "link" ? "link" : "code"}. Check clipboard permissions.</p>
        ) : null}
      </div>
      {open ? (
        <div id={bodyId} className={styles["body"]} style={bodyStyle}>
          {editing ? (
            <EditCodePanel initialCode={editSeed} onApply={applyCode} onClose={() => setEditSeed(null)} />
          ) : (
            <CodeView
              lines={lines}
              literals={literals}
              tracks={project.tracks}
              selectedTrackId={selectedTrackId}
              error={codeError}
              lineNumbers={editorPrefs.lineNumbers}
              onSetPattern={(trackId, pattern) => dispatch({ type: "track/setPattern", trackId, pattern })}
              menuCommands={{
                selectTrack: (trackId) => dispatch({ type: "ui/select", trackId }),
                editPattern: (trackId) => {
                  dispatch({ type: "ui/select", trackId });
                  navigate({ screen: "pattern", trackId });
                },
                copyCode: () => void copyCode(),
                copyLink: () => void copyLink(),
              }}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
