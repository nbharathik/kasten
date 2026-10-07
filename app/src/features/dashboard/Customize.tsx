// "Customize" on a dashboard: turn sections on and off and put them in
// order, with the usual set a click away. `extra` adds actions at the
// foot, such as hiding a project's home.

import { useRef, useState, type ReactNode } from "react";

import { Popup } from "../pages/page/Popup";
import { IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { sameList, shifted, toggled, type SectionDef } from "./sections";

interface CustomizeProps<Id extends string> {
  /** What is customized, e.g. "Project home". */
  label: string;
  defs: readonly SectionDef<Id>[];
  sections: readonly Id[];
  defaults: readonly Id[];
  onChange(next: Id[]): void;
  extra?: ReactNode;
}

export function Customize<Id extends string>({ label, defs, sections, defaults, onChange, extra }: CustomizeProps<Id>) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Shown sections first, in their order, then the rest as defs has them.
  const rows = [...sections.map((id) => defs.find((d) => d.id === id)!).filter(Boolean), ...defs.filter((d) => !sections.includes(d.id))];
  return (
    <span className="relative inline-flex">
      <IconButton ref={button} icon="sliders" label={`Customize ${label.toLowerCase()}`} size="sm" active={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <Popup label={`Customize ${label.toLowerCase()}`} anchor={button} onClose={() => setOpen(false)} className="kasten-dash-customize">
          <p className="kasten-dash-customize-title">{label}: sections</p>
          <ul>
            {rows.map((def) => {
              const on = sections.includes(def.id);
              const at = sections.indexOf(def.id);
              return (
                <li key={def.id} className={on ? "is-on" : ""}>
                  <label>
                    <input type="checkbox" checked={on} onChange={() => onChange(toggled(sections, def.id, defs))} />
                    <Icon name={def.icon} className="size-[15px] text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-13 font-medium">{def.label}</span>
                      <span className="block truncate text-12 text-muted">{def.hint}</span>
                    </span>
                  </label>
                  {on && (
                    <span className="flex">
                      <IconButton icon="chevron-up" label={`Move ${def.label} up`} size="sm" disabled={at === 0} onClick={() => onChange(shifted(sections, def.id, -1))} />
                      <IconButton icon="chevron-down" label={`Move ${def.label} down`} size="sm" disabled={at === sections.length - 1} onClick={() => onChange(shifted(sections, def.id, 1))} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="kasten-dash-customize-foot">
            <button type="button" className="ui-btn is-quiet is-sm" disabled={sameList(sections, defaults)} onClick={() => onChange([...defaults])}>
              Reset to the usual
            </button>
            {extra}
          </div>
        </Popup>
      )}
    </span>
  );
}
