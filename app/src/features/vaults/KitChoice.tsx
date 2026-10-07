// What a new vault starts with: a starter kit, the recommended one picked
// at first, or a blank vault with just the templates. Import and Restore
// have cards of their own.

import type { KitInfo } from "../../lib/vault/types";

export function KitChoice({ kits, value, onChange }: { kits: KitInfo[]; value: string | null; onChange: (id: string | null) => void }) {
  if (kits.length === 0) return null;
  const picked = kits.find((k) => k.id === value);
  const choices = [...kits.map((k) => ({ id: k.id as string | null, label: k.name, icon: k.icon })), { id: null, label: "Blank", icon: "📄" }];
  return (
    <fieldset className="flex flex-col gap-1 text-13">
      <legend className="mb-1 font-medium text-muted">Start with</legend>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((choice) => (
          <label
            key={choice.id ?? "blank"}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 ring-1 ${value === choice.id ? "bg-soft text-ink ring-accent" : "text-muted ring-line hover:bg-hover"}`}
          >
            <input type="radio" name="start-with" className="sr-only" checked={value === choice.id} onChange={() => onChange(choice.id)} />
            <span aria-hidden="true">{choice.icon}</span>
            {choice.label}
          </label>
        ))}
      </div>
      <p className="text-12 text-muted">
        {picked ? `${picked.summary}${picked.recommended ? " A good first choice." : ""} Undo in the app takes it back.` : "Just the templates; add a starter kit any time from the template gallery."}
      </p>
    </fieldset>
  );
}
