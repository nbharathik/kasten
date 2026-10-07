// One editor per property type. Each calls
// `onSave` with the new value for its key, or null to clear it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { PropDef } from "../../../lib/vault/types";
import { MultiSelectField, RelationField } from "./list-fields";
import { chipStyle, optionSwatch } from "./schemas";
import { asText, dayOf, isChecked, movedValue, openableUrl } from "./values";

export interface FieldProps {
  def: PropDef;
  value: unknown;
  /** The property's name, for its label. */
  label: string;
  onSave(value: unknown): void;
  /** The note being edited, so a relation cannot point at itself. */
  self: string;
}

/** The editor for `def`'s type; unknown types edit as text. */
export function PropField(props: FieldProps) {
  const { def, value, label, onSave } = props;
  switch (def.type) {
    case "number":
      return <InlineInput type="number" value={asText(value)} label={label} onCommit={(text) => onSave(numberFrom(text))} />;
    case "select":
      return <SelectField value={value} options={def.options} label={label} onSave={onSave} />;
    case "multi_select":
      return <MultiSelectField value={value} options={def.options} label={label} onSave={onSave} />;
    case "date":
      return <DateField value={value} label={label} onSave={onSave} />;
    case "checkbox":
      return <input type="checkbox" className="kasten-prop-check" aria-label={label} checked={isChecked(value)} onChange={(e) => onSave(e.target.checked)} />;
    case "url":
      return <UrlField value={asText(value)} label={label} onSave={onSave} />;
    case "relation":
      return <RelationField value={value} label={label} onSave={onSave} self={props.self} />;
    default:
      return <InlineInput value={asText(value)} label={label} onCommit={(text) => onSave(text.trim() || null)} />;
  }
}

function numberFrom(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // The core names the problem when the text is no number.
  return Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
}

/** Keeps a ref pointing at this render's values, for timers and unmounting.
 * A layout effect, so it is current before any later event reads it. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

interface InlineInputProps {
  value: string;
  label: string;
  onCommit(text: string): void;
  type?: "text" | "number" | "url";
  placeholder?: string;
}

/** Reads as text until focused. Saves on blur or Enter; Escape puts the value back. */
export function InlineInput({ value, label, onCommit, type = "text", placeholder = "Empty" }: InlineInputProps) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // A save, a rollback or an outside edit changed the value: show it.
    setShown(value);
    setDraft(value);
  }
  const latest = useLatest({ draft, value, onCommit });
  const cancelled = useRef(false);
  // Typing still in the field when it goes away (another page opened) is kept.
  useEffect(
    () => () => {
      const { draft, value, onCommit } = latest.current;
      if (draft !== value) onCommit(draft);
    },
    [latest],
  );
  // The Properties tab skips a save it already has on its way, so Enter
  // followed by the blur it causes writes once.
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      type={type}
      className="kasten-prop-input"
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      spellCheck={type === "text"}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        cancelled.current = false;
      }}
      onBlur={() => {
        if (cancelled.current) cancelled.current = false;
        else commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          cancelled.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** A day picker. Picking saves after a short pause, so typing a date saves once. */
function DateField({ value, label, onSave }: { value: unknown; label: string; onSave(value: unknown): void }) {
  const day = dayOf(value);
  const [draft, setDraft] = useState(day);
  const [shown, setShown] = useState(day);
  if (shown !== day) {
    setShown(day);
    setDraft(day);
  }
  const latest = useLatest({ draft, day, value, onSave });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { draft, day, value, onSave } = latest.current;
    // A time after the date stays.
    if (draft !== day) onSave(draft ? movedValue(value, draft) : null);
  }, [latest]);
  useEffect(() => () => commit(), [commit]);
  return (
    <input
      type="date"
      className="kasten-prop-input"
      aria-label={label}
      value={draft}
      title={typeof value === "string" && !day ? value : undefined}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (timer.current) clearTimeout(timer.current);
        // While a year is typed digit by digit it reads 0002, 0020…; wait for a real one.
        if (next === "" || Number(next.slice(0, 4)) >= 1000) timer.current = setTimeout(commit, 500);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

/** The value as a coloured pill; the native dropdown over it picks, "—" clears. */
function SelectField({ value, options, label, onSave }: { value: unknown; options: string[]; label: string; onSave(value: unknown): void }) {
  const current = asText(value);
  const known = options.includes(current);
  return (
    <span className="kasten-select">
      <span className={`kasten-pill${current ? "" : " is-empty"}`} style={current ? chipStyle(optionSwatch(current, options)) : undefined} aria-hidden="true">
        {current || "Empty"}
      </span>
      <select aria-label={label} value={current} onChange={(e) => onSave(e.target.value === "" ? null : e.target.value)}>
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {current && !known && <option value={current}>{current}</option>}
      </select>
    </span>
  );
}

function UrlField({ value, label, onSave }: { value: string; label: string; onSave(value: unknown): void }) {
  return (
    <span className="kasten-url">
      <InlineInput type="url" value={value} label={label} placeholder="https://" onCommit={(text) => onSave(text.trim() || null)} />
      {openableUrl(value) && (
        <a className="kasten-url-open" href={value.trim()} target="_blank" rel="noopener noreferrer" aria-label={`Open ${value}`} title={`Open ${value}`}>
          <OpenIcon />
        </a>
      )}
    </span>
  );
}

/** An arrow leaving a box: opens a link elsewhere. */
function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[14px]">
      <path d="M14 4.5h5.5V10M19.5 4.5l-8 8" />
      <path d="M17.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h5" />
    </svg>
  );
}
