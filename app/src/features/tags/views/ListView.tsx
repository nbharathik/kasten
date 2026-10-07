// A tag's notes as a list: icon, title, first line and the values of its
// first few properties. Click opens (Ctrl for a tab, Shift for the side stack).

import { useState } from "react";

import type { NoteMeta, PropDef } from "../../../lib/vault/types";
import { chipStyle, optionSwatch } from "../../panel/properties/schemas";
import { iconOf, titleOf } from "../../workspace/names";
import { howFromView, useWorkspace } from "../../workspace/store";
import { valueOf } from "../model";
import type { ViewProps } from "./types";
import { IconOrEmoji } from "../../../ui/IconOrEmoji";

/** A value as a short label: lists joined, dates as written, ticks as ✓. */
export function shortValue(value: unknown, def: PropDef | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (def?.type === "checkbox") return value === true || value === "true" ? "✓" : "";
  return String(value);
}

export function Values({ note, defs }: { note: NoteMeta; defs: PropDef[] }) {
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {defs.map((def) => {
        const text = shortValue(valueOf(note, def.key), def);
        if (!text) return null;
        const tinted = def.type === "select" ? chipStyle(optionSwatch(text, def.options)) : undefined;
        return (
          <span key={def.key} title={def.key} className={`kasten-tag-value ${tinted ? "is-tinted" : ""}`} style={tinted}>
            {text}
          </span>
        );
      })}
    </span>
  );
}

/** Rows drawn at first, and added per "Show more": a tag can have thousands. */
export const LIST_PAGE = 200;

export function ListView({ schema, notes }: ViewProps) {
  const defs = (schema?.properties ?? []).slice(0, 3);
  const open = useWorkspace.getState().openPath;
  const [limit, setLimit] = useState(LIST_PAGE);
  if (notes.length === 0) return <p className="kasten-tag-empty">No notes here yet.</p>;
  const more = notes.length - limit;
  return (
    <>
      <ul className="kasten-tag-list" aria-label="Notes">
        {notes.slice(0, limit).map((note) => (
          <li key={note.path}>
            <button type="button" onClick={(e) => open(note.path, howFromView(e))} onAuxClick={(e) => e.button === 1 && open(note.path, "tab")}>
              <span aria-hidden="true" className="kasten-tag-icon">
                <IconOrEmoji icon={iconOf(note)} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{titleOf(note)}</span>
                {note.excerpt && <span className="block truncate text-13 text-muted">{note.excerpt}</span>}
              </span>
              <Values note={note} defs={defs} />
            </button>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button type="button" className="kasten-tag-more" onClick={() => setLimit(limit + LIST_PAGE)}>
          Show {Math.min(LIST_PAGE, more).toLocaleString()} more of {notes.length.toLocaleString()}
        </button>
      )}
    </>
  );
}
