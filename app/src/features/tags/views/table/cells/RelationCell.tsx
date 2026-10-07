// Relation cells: the related notes' titles; editing opens a picker with
// the related notes (open or remove each) and a search to add more. Values
// are note ids; a note picked without one goes by its path, and the core
// gives it an id.

import { useId, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";

import type { NoteMeta } from "../../../../../lib/vault/types";
import { NOT_FOUND, relatedNote } from "../../../../panel/links/related";
import { findNotes } from "../../../../panel/properties/list-fields";
import { asList } from "../../../../panel/properties/values";
import { iconOf, titleOf } from "../../../../workspace/names";
import { howFromView, useWorkspace } from "../../../../workspace/store";
import { whereIfShared } from "../../../../workspace/where";
import { Floating } from "../Floating";
import { listOrNull } from "../format";
import { Glyph } from "../icons";
import { usePickerKeys } from "./usePickerKeys";
import type { TypeCellProps } from "./types";
import { IconOrEmoji } from "../../../../../ui/IconOrEmoji";

/** The notes `items` name, redrawn only when one of them changes. */
function useRelated(items: string[]): (NoteMeta | undefined)[] {
  return useWorkspace(useShallow((s) => items.map((item) => relatedNote(s.notes, item))));
}

export function RelationCell({ value, editing, seed, label, path, anchor, save, finish }: TypeCellProps) {
  const items = asList(value);
  const related = useRelated(items);
  const names = items.map((item, i) => (related[i] ? titleOf(related[i]) : item));
  return (
    <>
      <span className="kasten-table-chips" title={names.join(", ") || undefined}>
        {items.map((item, i) => {
          const note = related[i];
          return (
            <span key={item} className={`kasten-table-chip is-note${note ? "" : " is-missing"}`} title={note ? undefined : NOT_FOUND}>
              {note && <IconOrEmoji icon={iconOf(note)} />}
              {names[i]}
            </span>
          );
        })}
      </span>
      {editing && (
        <RelationMenu
          anchor={anchor}
          label={label}
          self={path}
          items={items}
          related={related}
          seed={seed}
          onChange={(next) => save(listOrNull(next))}
          onClose={finish}
        />
      )}
    </>
  );
}

interface RelationMenuProps extends Pick<TypeCellProps, "anchor" | "label" | "seed"> {
  self: string;
  items: string[];
  related: (NoteMeta | undefined)[];
  onChange(items: string[]): void;
  onClose: TypeCellProps["finish"];
}

function RelationMenu({ anchor, label, self, items, related, seed, onChange, onClose }: RelationMenuProps) {
  const notes = useWorkspace((s) => s.notes);
  const [query, setQuery] = useState(seed ?? "");
  const list = useId();
  // The note itself and notes already related are not offered again.
  const linked = useMemo(() => new Set([self, ...related.filter((n): n is NoteMeta => Boolean(n)).map((n) => n.path)]), [self, related]);
  const found = useMemo(() => findNotes(notes, linked, query), [notes, linked, query]);
  const add = (note: NoteMeta) => {
    onChange([...items, note.id ?? note.path]);
    setQuery("");
    keys.setActive(0);
  };
  const keys = usePickerKeys(found.length, (i) => add(found[i]!), onClose);
  const at = keys.at;

  return (
    <Floating anchor={anchor} label={label} onClose={() => onClose(null, false)} className="kasten-table-relations" minWidth={280}>
      {items.length > 0 && (
        <ul className="kasten-table-pop-related" aria-label="Related pages">
          {items.map((item, i) => {
            const note = related[i];
            return (
              <li key={item}>
                <button
                  type="button"
                  className="kasten-table-pop-open"
                  disabled={!note}
                  title={note ? `Open ${titleOf(note)}` : NOT_FOUND}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => note && useWorkspace.getState().openPath(note.path, howFromView(e))}
                >
                  <IconOrEmoji icon={note ? iconOf(note) : "?"} />
                  <span className="truncate">{note ? titleOf(note) : item}</span>
                </button>
                <button
                  type="button"
                  className="kasten-table-pop-x"
                  aria-label={`Remove ${note ? titleOf(note) : item}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onChange(items.filter((x) => x !== item))}
                >
                  <Glyph name="close" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        autoFocus
        className="kasten-table-pop-search"
        aria-label="Find a page"
        aria-controls={list}
        aria-activedescendant={at >= 0 ? `${list}-${at}` : undefined}
        placeholder="Link a page…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          keys.setActive(0);
        }}
        onKeyDown={keys.onKeyDown}
      />
      {found.length === 0 ? (
        <p className="kasten-table-pop-empty">No pages match</p>
      ) : (
        <ul id={list} role="listbox" aria-label="Pages" className="kasten-table-pop-list">
          {found.map((note, i) => (
            <li
              key={note.path}
              id={`${list}-${i}`}
              role="option"
              aria-selected={i === at}
              data-active={i === at || undefined}
              onMouseEnter={() => keys.setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(note)}
            >
              <IconOrEmoji icon={iconOf(note)} />
              <span className="truncate">{titleOf(note)}</span>
              <Where note={note} notes={notes} />
            </li>
          ))}
        </ul>
      )}
    </Floating>
  );
}

/** Where a picked note lives, when another shares its title. */
function Where({ note, notes }: { note: NoteMeta; notes: readonly NoteMeta[] }) {
  const where = whereIfShared(note, notes);
  return where ? <span className="kasten-picker-where">{where}</span> : null;
}
