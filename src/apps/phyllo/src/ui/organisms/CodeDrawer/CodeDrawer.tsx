import { generate, toShareUrl } from "@phyllo/engine";
import type { CodeScope } from "@phyllo/model";
import { Button, Icon, SegmentedControl } from "@phyllo/ui";
import type { SegmentedOption } from "@phyllo/ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import { useCodeDrawer, useEngine, useProject, useSelection, useTips, useUiMode } from "../../../hooks";
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
import { CodeView } from "./CodeView";
import type { CodeViewError } from "./CodeView";
import { EditCodePanel } from "./EditCodePanel";
import { EvaluatedAgo } from "./EvaluatedAgo";
import { useResizableHeight } from "./useResizableHeight";
import styles from "./CodeDrawer.module.css";

export interface CodeDrawerProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Starting height of the open code area in px; the user resizes it from the top edge. Default 196. */
  defaultHeight?: number;
}

type CopyState = "idle" | "copied" | "failed";

const DEFAULT_HEIGHT = 196;
const COPY_FEEDBACK_MS = 2500;
/** Tip step completed by sharing (TipCoach curriculum step 5). */
const SHARE_TIP_STEP = 5;

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

  const [editSeed, setEditSeed] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
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

  const copyLink = async () => {
    clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(toShareUrl(code));
      setCopyState("copied");
      complete(SHARE_TIP_STEP);
    } catch {
      // Clipboard access can be refused (permissions, unfocused window); say so instead of failing silently.
      setCopyState("failed");
    }
    copyTimer.current = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
  };

  // Edit code always works on the whole song: `applyCode` replaces every track, so section code would drop the rest.
  const startEditing = () => {
    setScope("song");
    setEditSeed(generate(project, { scope: "song" }).code);
  };

  const errorBanner = status.error ? errorBannerText(status.error, project.tracks, errorLocation, open) : null;

  const summary =
    mode === "guided" && !open ? (
      guidedSummary(project.tracks)
    ) : (
      <>
        {scopeSummary(project, scope, sectionBar)} · <EvaluatedAgo evaluatedAt={status.evaluatedAt} /> ·{" "}
        <span className={status.error ? styles["summaryError"] : undefined}>
          {errorSummary(status.error, project.tracks, errorLocation)}
        </span>
      </>
    );

  const classes = className ? `${styles["drawer"]} ${className}` : styles["drawer"];

  return (
    <section aria-label="Code" className={classes} data-open={open ? "" : undefined} {...rest}>
      {open ? <div className={styles["resizeHandle"]} aria-label="Resize code drawer" aria-controls={bodyId} {...handleProps} /> : null}
      <div className={styles["header"]}>
        <Icon name="code" size={16} className={styles["codeIcon"]} />
        <span className={styles["title"]}>Code</span>
        <span className={styles["summary"]}>{summary}</span>
        <span className={styles["spacer"]} />
        {open ? (
          <div className={styles["tools"]}>
            <SegmentedControl label="Code scope" size="sm" options={scopeOptions} value={scope} onChange={setScope} />
            {mode === "pro" && !editing ? (
              <Button size="sm" variant="ghost" iconStart="draw" onClick={startEditing}>
                Edit code
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void copyLink()}>
              {copyState === "copied" ? "Link copied" : "Copy strudel.cc link"}
            </Button>
          </div>
        ) : null}
        <Button size="sm" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          {open ? "Hide code" : "Show code"}
        </Button>
      </div>
      <div className={styles["messages"]} aria-live="polite">
        {errorBanner ? <p className={styles["errorBanner"]}>{errorBanner}</p> : null}
        {copyState === "copied" ? <p className={styles["visuallyHidden"]}>strudel.cc link copied to the clipboard</p> : null}
        {copyState === "failed" ? <p className={styles["errorBanner"]}>Couldn&apos;t copy the link. Check clipboard permissions.</p> : null}
      </div>
      {open ? (
        <div id={bodyId} className={styles["body"]} style={{ height }}>
          {editing ? (
            <EditCodePanel initialCode={editSeed} onApply={applyCode} onClose={() => setEditSeed(null)} />
          ) : (
            <CodeView
              lines={lines}
              literals={literals}
              tracks={project.tracks}
              selectedTrackId={selectedTrackId}
              error={codeError}
              onSetPattern={(trackId, pattern) => dispatch({ type: "track/setPattern", trackId, pattern })}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
