// The services a provider starts from, as a row of chips that are radio
// buttons underneath: the arrows move between them, as between any radios.

import { PRESETS, type PresetId } from "./presets";

export function ServicePicker({ value, onChange }: { value: PresetId; onChange(id: PresetId): void }) {
  return (
    <div role="radiogroup" aria-label="Service" className="flex flex-wrap gap-1.5">
      {PRESETS.map((preset) => (
        <label key={preset.id} className="relative cursor-pointer">
          <input type="radio" name="provider-service" value={preset.id} checked={value === preset.id} onChange={() => onChange(preset.id)} className="peer sr-only" />
          <span className="flex h-7 items-center rounded-md border border-line px-2.5 text-13 text-muted hover:bg-hover hover:text-ink peer-checked:border-accent/60 peer-checked:bg-accent/10 peer-checked:text-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
            {preset.label}
          </span>
        </label>
      ))}
    </div>
  );
}
