import { type ReactNode, useEffect, useState } from "react";

interface NumberFieldProps {
  label: string;
  /** "mixed" shows nothing and commits whatever is typed. */
  value: number | "mixed" | null;
  onCommit(value: number): void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  width?: number;
  decimals?: number;
  disabled?: boolean;
}

/** A number in a box: Enter or leaving it commits, and the arrow keys step (Shift steps ten times as far). */
export function NumberField({ label, value, onCommit, step = 1, min, max, unit, width = 64, decimals = 2, disabled }: NumberFieldProps) {
  const shown = typeof value === "number" ? String(Math.round(value * 10 ** decimals) / 10 ** decimals) : "";
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return setText(shown);
    const clamped = Math.min(Math.max(n, min ?? -Infinity), max ?? Infinity);
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <label className="ks-field">
      <span className="ks-field-label">{label}</span>
      <input
        className="ks-input"
        style={{ width }}
        inputMode="decimal"
        value={text}
        placeholder={value === "mixed" ? "—" : undefined}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(event.currentTarget.value);
          else if (event.key === "Escape") setText(shown);
          else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const base = Number(text);
            const start = Number.isFinite(base) ? base : typeof value === "number" ? value : 0;
            commit(String(start + (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1)));
          }
        }}
      />
      {unit ? <span className="ks-field-unit">{unit}</span> : null}
    </label>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T | "mixed" | null;
  options: { value: T; label: ReactNode; title: string }[];
  onPick(value: T): void;
}

/** A row of choices, one of which is picked. */
export function Segmented<T extends string>({ label, value, options, onPick }: SegmentedProps<T>) {
  return (
    <div className="ks-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.title}
          data-tip={option.title}
          data-ks-keep-focus=""
          className={`ks-seg${value === option.value ? " is-on" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** An on-off switch with a label. */
export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange(on: boolean): void }) {
  return (
    <label className="ks-toggle">
      <input type="checkbox" checked={on} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** A labelled group of controls in a side panel. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ks-section">
      <h3 className="ks-section-title">{title}</h3>
      {children}
    </section>
  );
}
