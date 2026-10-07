// The vault chooser's building blocks: a card per way in, a labelled field
// that can browse for a folder, and the card's button.

import type { ReactNode } from "react";

import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";

export function Card({ icon, title, detail, children }: { icon: IconName; title: string; detail: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-canvas p-5 shadow-card" aria-label={title}>
      <span className="grid size-10 place-items-center rounded-xl bg-panel text-ink" aria-hidden="true">
        <Icon name={icon} className="size-5" />
      </span>
      <h2 className="mt-2 text-16 font-semibold">{title}</h2>
      <p className="mb-4 mt-1 text-13 text-muted">{detail}</p>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A labelled field; `browse` adds a Browse… button that picks a folder,
 * and `secret` hides what is typed, as for a token. The field stays one
 * element when the button comes (the folders load after the first paint),
 * so typing there keeps its focus. */
export function Field({ label, value, onChange, placeholder, mono, browse, secret }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; mono?: boolean; browse?: () => void; secret?: boolean }) {
  return (
    <div className="flex flex-col gap-1 text-13 font-medium text-muted">
      <span aria-hidden="true">{label}</span>
      <div className="flex gap-1.5">
        <input
          type={secret ? "password" : "text"}
          autoComplete={secret ? "off" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          aria-label={label}
          className={`h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-13 font-normal text-ink outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-soft)] ${mono ? "font-mono text-13" : ""}`}
        />
        {browse && (
          <button type="button" onClick={browse} className="h-9 shrink-0 rounded-lg px-3 text-13 font-medium text-ink ring-1 ring-line transition hover:bg-hover">
            Browse…
          </button>
        )}
      </div>
    </div>
  );
}

export function Button({ children, busy, disabled, primary }: { children: ReactNode; busy: boolean; disabled: boolean; primary?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-busy={busy}
      className={`mt-2 h-9 rounded-lg text-13 font-medium transition disabled:opacity-60 ${primary ? "bg-accent text-on-accent shadow-card hover:brightness-110" : "ring-1 ring-line hover:bg-hover"}`}
    >
      {children}
    </button>
  );
}
