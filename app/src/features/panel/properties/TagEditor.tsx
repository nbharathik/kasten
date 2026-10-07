// The note's tags as chips, with "Add tag" suggesting every tag in the vault
// and every tag that has a schema.

import { useId, useMemo, useState } from "react";

import type { NoteMeta, TagSchema } from "../../../lib/vault/types";
import { useWorkspace } from "../../workspace/store";
import { chipStyle, schemaOf, swatch } from "./schemas";

const MAX_OPTIONS = 8;

/** A tag as the core stores it: no leading #, no surrounding space. */
export const cleanTag = (text: string) => text.trim().replace(/^#+/, "").trim();

/** The core skips tags with these, so the panel does not offer them. */
const validTag = (tag: string) => tag !== "" && !/[,[\]\n]/.test(tag);

/** Every tag in use and every schema's tag, most used first. */
export function knownTags(notes: NoteMeta[], schemas: TagSchema[] | null): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  const add = (tag: string, n: number) => {
    const key = tag.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.count += n;
    else counts.set(key, { tag, count: n });
  };
  for (const note of notes) for (const tag of note.tags) add(tag, 1);
  for (const schema of schemas ?? []) add(schema.name, 0);
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).map((t) => t.tag);
}

export interface TagOption {
  tag: string;
  /** A tag no note has yet. */
  create?: boolean;
}

/** Suggestions for `query`: matching tags the note lacks, then "create" for a new one. */
export function tagOptions(known: string[], have: string[], query: string): TagOption[] {
  const q = cleanTag(query).toLowerCase();
  const had = new Set(have.map((t) => t.toLowerCase()));
  const matches: TagOption[] = known
    .filter((t) => !had.has(t.toLowerCase()) && t.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)))
    .slice(0, MAX_OPTIONS)
    .map((tag) => ({ tag }));
  const exists = had.has(q) || known.some((t) => t.toLowerCase() === q);
  if (q && !exists && validTag(cleanTag(query))) matches.push({ tag: cleanTag(query), create: true });
  return matches;
}

interface TagEditorProps {
  tags: string[];
  schemas: TagSchema[] | null;
  onAdd(tag: string): void;
  onRemove(tag: string): void;
}

export function TagEditor({ tags, schemas, onAdd, onRemove }: TagEditorProps) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="kasten-chips">
      {tags.map((tag) => (
        <span key={tag} className="kasten-chip" style={chipStyle(swatch(schemaOf(schemas, tag)?.color))}>
          <span className="kasten-chip-text">{tag}</span>
          <button type="button" className="kasten-chip-x" aria-label={`Remove tag ${tag}`} title={`Remove #${tag}`} onClick={() => onRemove(tag)}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <TagInput tags={tags} schemas={schemas} onAdd={onAdd} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="kasten-chip-add" onClick={() => setAdding(true)}>
          + Add tag
        </button>
      )}
    </div>
  );
}

/** The text field with its suggestions; mounted only while adding, so the
 * vault's tags are gathered only then. */
function TagInput({ tags, schemas, onAdd, onDone }: { tags: string[]; schemas: TagSchema[] | null; onAdd(tag: string): void; onDone(): void }) {
  const notes = useWorkspace((s) => s.notes);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const known = useMemo(() => knownTags(notes, schemas), [notes, schemas]);
  const options = useMemo(() => tagOptions(known, tags, query), [known, tags, query]);
  const id = useId();
  const pick = (option: TagOption | undefined) => {
    if (!option) return;
    onAdd(option.tag);
    setQuery("");
    setActive(0);
  };
  return (
    <span className="kasten-tag-input">
      <input
        role="combobox"
        aria-label="Add tag"
        aria-expanded={options.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={options[active] ? `${id}-${active}` : undefined}
        placeholder="Tag name"
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onBlur={onDone}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((a) => (options.length ? (a + step + options.length) % options.length : 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onDone();
          }
        }}
      />
      {options.length > 0 && (
        <ul id={`${id}-list`} role="listbox" aria-label="Tags" className="kasten-tag-options">
          {options.map((option, i) => (
            <li
              key={option.tag}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
            >
              {option.create ? (
                <>
                  Create <strong>#{option.tag}</strong>
                </>
              ) : (
                <>
                  <span className="kasten-tag-dot" style={chipStyle(swatch(schemaOf(schemas, option.tag)?.color))} aria-hidden="true" />#{option.tag}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
