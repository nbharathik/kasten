// Writing on the board: a sticky's text in a text area, and one-line fields
// for a section's label, a link's address and an edge's label. Letting go
// (leaving the field) saves; Escape saves too, except in one-line fields
// where it puts the old text back. A field that goes away while written in
// (the board closes, another view opens) saves what it holds.

import { useEffect, useRef, useState } from "react";

/** Saves the text typed when the field goes away before it was saved. An
 * unchanged field saves nothing, so React's trial unmount in development
 * does not end the writing. */
function useSaveOnUnmount(initial: string, done: { current: boolean }, save: (text: string) => void) {
  const opened = useRef(initial);
  const typed = useRef(initial);
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  useEffect(
    () => () => {
      if (done.current || typed.current === opened.current) return;
      done.current = true;
      latest.current(typed.current);
    },
    [done],
  );
  return typed;
}

import { useBoard } from "../context";

/** Leaves the field for the board, so the board's keys work again. */
function backToBoard(el: HTMLElement | null) {
  el?.closest<HTMLElement>(".kasten-board")?.focus();
}

/** `onTab`, when given, saves and grows the mind map: Tab adds a child. */
export function StickyEditor({ text, onDone, onTab }: { text: string; onDone: (text: string) => void; onTab?: () => void }) {
  const [value, setValue] = useState(text);
  const field = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const typed = useSaveOnUnmount(text, done, onDone);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <textarea
      ref={field}
      value={value}
      aria-label="Sticky text"
      placeholder="Write something…"
      className="kasten-sticky-editor nodrag nowheel nopan"
      onChange={(e) => {
        setValue(e.target.value);
        typed.current = e.target.value;
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          finish();
          backToBoard(field.current);
        } else if (e.key === "Tab" && !e.shiftKey && onTab) {
          e.preventDefault();
          finish();
          backToBoard(field.current);
          onTab();
        }
      }}
    />
  );
}

interface LineEditorProps {
  text: string;
  label: string;
  placeholder?: string;
  className?: string;
  onDone: (text: string | null) => void;
}

/** A one-line field: Enter saves, Escape gives up. `onDone` gets null when
 * nothing should change. */
export function LineEditor({ text, label, placeholder, className = "", onDone }: LineEditorProps) {
  const [value, setValue] = useState(text);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const typed = useSaveOnUnmount(text, done, onDone);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(keep ? value : null);
  };
  return (
    <input
      ref={field}
      value={value}
      aria-label={label}
      placeholder={placeholder}
      className={`kasten-line-editor nodrag nopan ${className}`}
      onChange={(e) => {
        setValue(e.target.value);
        typed.current = e.target.value;
      }}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
          backToBoard(field.current);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
          backToBoard(field.current);
        }
      }}
    />
  );
}

/** Stops writing without saving anything (the field's text is kept by `onDone`). */
export function useStopEditing() {
  const board = useBoard();
  return () => board.store.setState({ editing: null });
}
