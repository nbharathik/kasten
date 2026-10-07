// Building blocks for Settings: groups, rows, switches and segmented
// choices, in the window's accent colour.

import type { ReactNode } from "react";

import { Segmented as Kit } from "../../../../ui/Segmented";
import { sectionId } from "./sections";

export function Group({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <section id={sectionId(title)} className="mt-8 scroll-mt-6" aria-label={title}>
      <h2 className="text-12 font-medium tracking-[0.06em] text-muted">{title}</h2>
      {detail && <p className="mt-1 text-13 text-muted">{detail}</p>}
      <div className="mt-2 divide-y divide-line rounded-xl border border-line bg-canvas px-4 shadow-card">{children}</div>
    </section>
  );
}

export function Row({ label, detail, children }: { label: string; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-14 font-medium">{label}</div>
        {detail && <div className="mt-0.5 text-13 text-muted">{detail}</div>}
      </div>
      {children}
    </div>
  );
}

/** A checkbox drawn as a switch. */
export function Switch({ label, detail, checked, onChange }: { label: string; detail?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <Row label={label} detail={detail}>
      <label className="relative inline-flex cursor-pointer items-center">
        <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        {/* The knob takes the accent's own text colour when on, so it shows on a light accent too. */}
        <span className="h-5 w-9 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-knob shadow transition-transform peer-checked:translate-x-4 peer-checked:bg-on-accent" />
      </label>
    </Row>
  );
}

/** A few choices side by side, one picked: the kit's segmented control,
 * as a radio group. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void }) {
  return <Kit radio size="lg" label={label} value={value} choices={options.map((o) => ({ value: o.id, label: o.label }))} onChange={onChange} />;
}
