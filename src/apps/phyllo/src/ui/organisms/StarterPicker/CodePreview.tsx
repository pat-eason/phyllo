import { useId } from "react";
import { highlightCode } from "./highlight";
import styles from "./StarterPicker.module.css";

export interface CodePreviewProps {
  /** The Strudel program the selected starter writes. */
  code: string;
}

/** Read-only, syntax-coloured listing: "The code it writes". */
export function CodePreview({ code }: CodePreviewProps) {
  const labelId = useId();
  return (
    <div className={styles["codeColumn"]}>
      <div className={styles["codeHeader"]}>
        <span id={labelId} className={styles["label"]}>
          The code it writes
        </span>
        <span className={styles["hint"]}>editable later</span>
      </div>
      <div className={styles["code"]} role="textbox" aria-readonly="true" aria-multiline="true" aria-labelledby={labelId} tabIndex={0}>
        <pre className={styles["pre"]}>
          <code>{highlightCode(code)}</code>
        </pre>
      </div>
    </div>
  );
}
