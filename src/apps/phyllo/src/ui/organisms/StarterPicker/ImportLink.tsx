import { fromShareUrl } from "@phyllo/engine";
import { Button, TextField } from "@phyllo/ui";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useProject } from "../../../hooks";
import styles from "./StarterPicker.module.css";

export const SHORT_LINK_MESSAGE = "Short links can't be opened offline — use Share › Copy link with code in strudel.cc";
export const NOT_A_LINK_MESSAGE = "That doesn't look like a strudel.cc link with code in it.";

const LINK = /^(?:https?:\/\/|strudel\.cc\b|#)/i;

export interface ImportLinkProps {
  /** Called after the imported code became the open project. */
  onImported: () => void;
}

/**
 * "Or paste a strudel.cc link": decodes the link with the engine, imports the code as a new unsaved project
 * (each `$:` pattern becomes a track) and reports parse errors inline with line and column. Pasting plain
 * Strudel code works too.
 */
export function ImportLink({ onImported }: ImportLinkProps) {
  const { importCode } = useProject();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = value.trim();
    if (input === "") {
      setError("Paste a strudel.cc link first.");
      return;
    }
    let code = input;
    if (LINK.test(input)) {
      const decoded = fromShareUrl(input.replace(/^strudel\.cc/i, "https://strudel.cc"));
      if (decoded === null) {
        setError(NOT_A_LINK_MESSAGE);
        return;
      }
      if ("shortId" in decoded) {
        setError(SHORT_LINK_MESSAGE);
        return;
      }
      code = decoded.code;
    }
    const result = importCode(code);
    if (!result.ok) {
      const where = result.line === undefined ? "" : ` (line ${result.line}, column ${result.column ?? 1})`;
      setError(`${result.error}${where}`);
      return;
    }
    setError(null);
    setValue("");
    onImported();
  };

  return (
    <form className={styles["block"]} onSubmit={submit}>
      <span className={styles["label"]} aria-hidden="true">
        Or paste a strudel.cc link
      </span>
      <div className={styles["importRow"]}>
        <TextField
          className={styles["importField"]}
          label="strudel.cc link"
          size="lg"
          type="text"
          placeholder="https://strudel.cc/#…"
          value={value}
          invalid={error !== null}
          description={error ?? undefined}
          aria-describedby={hintId}
          autoComplete="off"
          onChange={(next) => {
            setValue(next);
            if (error !== null) setError(null);
          }}
        />
        <Button type="submit" size="lg" className={styles["importButton"]}>
          Import
        </Button>
      </div>
      <span id={hintId} className={styles["hint"]}>
        Each <code className={styles["mono"]}>$:</code> pattern becomes its own track.
      </span>
    </form>
  );
}
