// Properties holding lists: multi-selects (option chips to toggle, or free
// text when the schema has no options) and relations to other notes.

import { useMemo, useRef, useState, type RefObject } from "react";

import type { NoteMeta } from "../../../lib/vault/types";
import { Popup } from "../../pages/page/Popup";
import { iconOf, titleOf } from "../../workspace/names";
import { useWorkspace } from "../../workspace/store";
import { openable } from "../../workspace/tree";
import { whereIfShared } from "../../workspace/where";
import { NOT_FOUND, relatedNote } from "../links/related";
import { chipStyle, optionSwatch } from "./schemas";
import { asList } from "./values";
import { IconOrEmoji } from "../../../ui/IconOrEmoji";

interface ListFieldProps {
  value: unknown;
  label: string;
  onSave(value: unknown): void;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** An empty list is stored as no value. */
const listOrNull = (items: string[]) => (items.length > 0 ? items : null);

export function MultiSelectField({ value, options, label, onSave }: ListFieldProps & { options: string[] }) {
  const items = asList(value);
  if (options.length === 0) return <FreeList items={items} label={label} onSave={onSave} />;
  const has = (option: string) => items.some((i) => same(i, option));
  const toggle = (option: string) => onSave(listOrNull(has(option) ? items.filter((i) => !same(i, option)) : [...items, option]));
  // Values the schema no longer offers stay visible, so they can be removed.
  const extra = items.filter((i) => !options.some((o) => same(o, i)));
  return (
    <div className="kasten-chips" role="group" aria-label={label}>
      {[...options, ...extra].map((option) => (
        <button
          key={option}
          type="button"
          className="kasten-chip is-toggle"
          aria-pressed={has(option)}
          style={has(option) ? chipStyle(optionSwatch(option, options)) : undefined}
          onClick={() => toggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Chips of free text, with an input to add more. */
function FreeList({ items, label, onSave }: { items: string[]; label: string; onSave(value: unknown): void }) {
  const [text, setText] = useState("");
  const add = () => {
    const next = text.trim().replace(/,+$/, "").trim();
    setText("");
    if (next && !items.some((i) => same(i, next))) onSave([...items, next]);
  };
  return (
    <div className="kasten-chips" role="group" aria-label={label}>
      {items.map((item) => (
        <span key={item} className="kasten-chip" style={chipStyle(optionSwatch(item, []))}>
          <span className="kasten-chip-text">{item}</span>
          <button type="button" className="kasten-chip-x" aria-label={`Remove ${item}`} onClick={() => onSave(listOrNull(items.filter((i) => i !== item)))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="kasten-chip-input"
        aria-label={`Add to ${label}`}
        placeholder={items.length ? "Add…" : "Empty"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Escape") setText("");
        }}
      />
    </div>
  );
}

/** Related notes as chips, stored as ids; a note picked without one goes
 * by its path, and the core gives it an id. */
export function RelationField({ value, label, onSave, self }: ListFieldProps & { self: string }) {
  const notes = useWorkspace((s) => s.notes);
  const openPath = useWorkspace((s) => s.openPath);
  const [picking, setPicking] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const items = asList(value);
  // The note itself and notes already related are not offered again.
  const linked = useMemo(() => {
    const paths = asList(value).map((i) => relatedNote(notes, i)?.path);
    return new Set([self, ...paths.filter((p): p is string => Boolean(p))]);
  }, [self, value, notes]);

  return (
    <div className="kasten-chips" role="group" aria-label={label}>
      {items.map((item) => {
        const note = relatedNote(notes, item);
        const name = note ? titleOf(note) : item;
        const where = note && whereIfShared(note, notes);
        return (
          <span key={item} className={`kasten-chip is-note${note ? "" : " is-missing"}`}>
            <button
              type="button"
              className="kasten-chip-open"
              disabled={!note}
              title={note ? `Open ${name}${where ? ` (${where})` : ""}` : NOT_FOUND}
              onClick={() => note && openPath(note.path)}
            >
              {note && <IconOrEmoji icon={iconOf(note)} />}
              <span className="kasten-chip-text">{name}</span>
            </button>
            <button type="button" className="kasten-chip-x" aria-label={`Remove ${name}`} onClick={() => onSave(listOrNull(items.filter((i) => i !== item)))}>
              ×
            </button>
          </span>
        );
      })}
      <span className="kasten-picker-anchor">
        <button ref={anchor} type="button" className="kasten-chip-add" aria-label={`Add a page to ${label}`} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
          + Add
        </button>
        {picking && (
          <NotePicker
            anchor={anchor}
            notes={notes}
            exclude={linked}
            onClose={() => setPicking(false)}
            onPick={(note) => {
              setPicking(false);
              onSave([...items, note.id ?? note.path]);
            }}
          />
        )}
      </span>
    </div>
  );
}

const MAX_FOUND = 8;

/** Notes to offer: title matches first, else the latest edited. */
export function findNotes(notes: NoteMeta[], exclude: Set<string>, query: string): NoteMeta[] {
  const q = query.trim().toLowerCase();
  const pool = openable(notes).filter((n) => !exclude.has(n.path));
  if (!q) return pool.sort((a, b) => b.modified - a.modified).slice(0, MAX_FOUND);
  const rank = (n: NoteMeta) => {
    const title = titleOf(n).toLowerCase();
    return title.startsWith(q) ? 0 : title.includes(` ${q}`) ? 1 : title.includes(q) ? 2 : 3;
  };
  return pool
    .map((n) => ({ n, rank: rank(n) }))
    .filter((r) => r.rank < 3)
    .sort((a, b) => a.rank - b.rank || titleOf(a.n).localeCompare(titleOf(b.n)))
    .slice(0, MAX_FOUND)
    .map((r) => r.n);
}

interface PickerProps {
  anchor: RefObject<HTMLElement | null>;
  notes: NoteMeta[];
  exclude: Set<string>;
  onPick(note: NoteMeta): void;
  onClose(): void;
}

/** A small search over the vault's notes. */
function NotePicker({ anchor, notes, exclude, onPick, onClose }: PickerProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const found = useMemo(() => findNotes(notes, exclude, query), [notes, exclude, query]);
  return (
    <Popup label="Add a page" anchor={anchor} onClose={onClose} className="kasten-note-picker">
      <input
        className="kasten-popup-search"
        aria-label="Find a page"
        placeholder="Find a page…"
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((a) => (found.length ? (a + step + found.length) % found.length : 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const note = found[active];
            if (note) onPick(note);
          }
        }}
      />
      {found.length === 0 ? (
        <p className="kasten-popup-empty">No pages match</p>
      ) : (
        <ul role="listbox" aria-label="Pages" className="kasten-picker-list">
          {found.map((note, i) => {
            const where = whereIfShared(note, notes);
            return (
              <li
                key={note.path}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(note);
                }}
              >
                <IconOrEmoji icon={iconOf(note)} />
                <span className="kasten-chip-text">{titleOf(note)}</span>
                {where && <span className="kasten-picker-where">{where}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Popup>
  );
}
