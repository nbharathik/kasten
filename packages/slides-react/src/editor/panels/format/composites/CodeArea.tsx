import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import "./composites.css";

interface CodeAreaProps {
  label: string;
  value: string;
  /** The selected elements disagree: the box is empty and says so. */
  mixed?: boolean;
  onCommit(value: string): void;
  placeholder?: string;
  rows?: number;
  /** Set in the code font with no line wrapped (code, LaTeX). Off for plain text. */
  code?: boolean;
  /** Tab puts a tab in the text (code); off, it moves to the next control as in any box. `code` by default. */
  tabs?: boolean;
  /** Marks this as the field a double click on the element puts the caret in. */
  primary?: boolean;
  invalid?: boolean;
}

/**
 * Several lines of text that are kept as they are typed, tabs included: in code,
 * Tab puts a tab in the text (Escape first, or Shift+Tab, moves on to the next
 * control, so the keyboard is not trapped). What was typed goes into the deck when
 * the box is left or on Ctrl+Enter, as one step of undo; Escape puts back what was there.
 */
export function CodeArea({ label, value, mixed, onCommit, placeholder, rows = 8, code = true, tabs = code, primary, invalid }: CodeAreaProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value, mixed]);
  // After Escape the next Tab leaves the box instead of typing a tab.
  const released = useRef(false);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const tabbing = event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (tabbing && tabs && !released.current) {
      event.preventDefault();
      const box = event.currentTarget;
      box.setRangeText("\t", box.selectionStart, box.selectionEnd, "end");
      setText(box.value);
      return;
    }
    released.current = event.key === "Escape";
    if (event.key === "Escape") setText(value);
    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  };
  return (
    <textarea
      className={`ks-input ks-sp-area ks-cs-area${code ? " is-code" : ""}`}
      rows={rows}
      value={text}
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={mixed ? "Mixed" : placeholder}
      spellCheck={!code}
      autoCapitalize="off"
      autoCorrect="off"
      wrap={code ? "off" : "soft"}
      {...(primary ? { "data-primary": "" } : {})}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}
