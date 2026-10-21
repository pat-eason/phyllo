import { TextField } from "@phyllo/ui";
import type { TextFieldProps } from "@phyllo/ui";
import { useState } from "react";

interface DraftFieldProps extends Omit<TextFieldProps, "value" | "onChange" | "onBlur"> {
  value: string;
  /** Called with the typed text when the field loses focus or Enter is pressed. */
  onCommit: (draft: string) => void;
}

/**
 * A text field that applies its value on blur / Enter instead of per keystroke, so half-typed input (an empty
 * port, "5") never reaches settings. The text reverts to the saved value when the commit changes nothing.
 */
export function DraftField({ value, onCommit, onKeyDown, ...rest }: DraftFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  }

  return (
    <TextField
      {...rest}
      value={draft ?? value}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter" && !event.defaultPrevented) commit();
      }}
    />
  );
}
