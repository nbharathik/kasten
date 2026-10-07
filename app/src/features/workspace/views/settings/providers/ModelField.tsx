// The model a provider's chats start with: typed, or picked from the
// models the provider lists. The list is asked for on request, with the
// form's key, and forgotten once the address, kind or key changes.

import { useId, useRef, useState, type KeyboardEvent } from "react";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface Props {
  value: string;
  onChange(model: string): void;
  placeholder: string;
  autoFocus?: boolean;
  /** What the list depends on; a new value forgets the list. */
  source: string;
  /** Whether the provider can be asked yet. */
  ready: boolean;
  /** Asks the provider for its models; rejects with why not. */
  list(): Promise<string[]>;
}

export function ModelField({ value, onChange, placeholder, autoFocus, source, ready, list }: Props) {
  const id = useId();
  const [found, setFound] = useState<{ source: string; models: string[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ source: string; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const models = found?.source === source ? found.models : null;
  const typed = value.trim().toLowerCase();
  // All of them until something not in the list is typed; then the matches.
  const shown = !models ? [] : !typed || models.some((m) => m.toLowerCase() === typed) ? models : models.filter((m) => m.toLowerCase().includes(typed));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setFound({ source, models: await list() });
      setOpen(true);
    } catch (err) {
      setError({ source, text: message(err) });
    } finally {
      setLoading(false);
    }
  };

  const options = () => [...(box.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
  const pick = (model: string) => {
    onChange(model);
    setOpen(false);
    input.current?.focus();
  };
  const close = (event: KeyboardEvent) => {
    // Escape closes the list, not the form around it.
    event.stopPropagation();
    setOpen(false);
    input.current?.focus();
  };

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && models) {
      event.preventDefault();
      setOpen(true);
      // The list is drawn first when it was closed.
      requestAnimationFrame(() => (options().find((o) => o.getAttribute("aria-selected") === "true") ?? options()[0])?.focus());
    } else if (event.key === "Escape" && open) close(event);
  };
  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = options();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? Math.min(at + 1, all.length - 1) : at - 1;
      if (next < 0) input.current?.focus();
      else all[next]?.focus();
    } else if ((event.key === "Enter" || event.key === " ") && at >= 0) {
      event.preventDefault();
      pick(all[at]!.textContent ?? "");
    } else if (event.key === "Escape") close(event);
  };

  const note = error?.source === source ? error.text : models ? `${models.length === 1 ? "1 model" : `${models.length} models`} listed: pick one, or type a name.` : null;
  return (
    <div
      className="flex flex-col gap-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="text-13 font-medium text-muted">
        Model
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          ref={input}
          className="ui-field min-w-0 flex-1"
          value={value}
          autoFocus={autoFocus}
          aria-label="Model"
          aria-expanded={models ? open : undefined}
          aria-controls={open ? `${id}-list` : undefined}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            if (models) setOpen(true);
          }}
          onKeyDown={onInputKey}
        />
        <button type="button" className="ui-btn min-w-28 shrink-0 justify-center" disabled={!ready || loading} onClick={() => (models ? setOpen(!open) : void load())}>
          {loading ? "Listing…" : models ? (open ? "Hide models" : "Show models") : "List models"}
        </button>
      </div>
      {open && shown.length > 0 && (
        <div ref={box} id={`${id}-list`} role="listbox" aria-label="Models" className="max-h-48 overflow-y-auto rounded-md border border-line bg-canvas py-1 shadow-card" onKeyDown={onListKey}>
          {shown.map((model) => (
            <div
              key={model}
              role="option"
              aria-selected={model === value.trim()}
              tabIndex={-1}
              className="cursor-pointer truncate px-2.5 py-1 text-13 outline-none hover:bg-hover focus:bg-hover aria-selected:font-medium aria-selected:text-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(model)}
            >
              {model}
            </div>
          ))}
        </div>
      )}
      {note && (
        <div role={error?.source === source ? "alert" : undefined} className={`text-12 ${error?.source === source ? "text-danger" : "text-muted"}`}>
          {note}
        </div>
      )}
    </div>
  );
}
