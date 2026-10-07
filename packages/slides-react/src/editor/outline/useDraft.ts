import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** How long after the last key what was typed is written to the deck. */
export const WRITE_DELAY = 500;

export interface Draft {
  /** What the field shows. */
  value: string;
  onChange(text: string): void;
  onBlur(): void;
  /** Whether words have been typed that are not yet written to the deck. */
  typing(): boolean;
}

/**
 * Words typed into a field are the field's own until they are written: after
 * a pause in typing, when the focus leaves, and when the field goes away.
 *
 * Until the first key the field shows what the deck holds, so a change made
 * elsewhere appears in it. After typing it keeps showing what was typed until
 * the focus leaves, so the words are not rewritten under the caret when the
 * deck words them differently (a body gives every line a bullet, for
 * instance); but a change from elsewhere (undo, another window) still takes
 * the field over, unless the person has typed since.
 *
 * `stored` is what the deck holds now, as the field would show it; `read`
 * answers the same from the deck at the moment it is asked, which tells the
 * deck showing our own words back apart from a change made by someone else.
 */
export function useDraft(stored: string, write: (text: string) => void, read: () => string): Draft {
  const [draft, setDraft] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const echo = useRef(false);
  const seen = useRef(stored);
  const latest = useRef({ write, read });
  useLayoutEffect(() => {
    latest.current = { write, read };
  });

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const text = pending.current;
    if (text === null) return;
    pending.current = null;
    const before = latest.current.read();
    latest.current.write(text);
    // When the deck now says something else, it will show that back to the field: not a change from elsewhere.
    echo.current = latest.current.read() !== before;
  }, []);

  // The field going away, such as the outline giving way to the slide, still writes.
  useLayoutEffect(() => flush, [flush]);

  useLayoutEffect(() => {
    if (seen.current === stored) return;
    seen.current = stored;
    if (echo.current) echo.current = false;
    else if (pending.current === null) setDraft(null);
  }, [stored]);

  return {
    value: draft ?? stored,
    onChange(text) {
      pending.current = text;
      setDraft(text);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, WRITE_DELAY);
    },
    onBlur() {
      flush();
      setDraft(null);
    },
    typing: () => pending.current !== null,
  };
}
