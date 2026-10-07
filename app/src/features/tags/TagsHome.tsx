// The Tag Database page: every tag with its note count, colour and
// properties. Opening one shows its database; "New tag" starts one.

import "./tags.css";

import { useEffect, useMemo, useState } from "react";

import { chipStyle, swatch } from "../panel/properties/schemas";
import { tagCounts } from "../workspace/tree";
import { howFrom, useWorkspace } from "../workspace/store";
import { vaultTags, viewsOf } from "./model";
import { tagPlace } from "./place";
import { useTags } from "./store";
import { Icon } from "../../ui/Icon";

export function TagsHome() {
  const notes = useWorkspace((s) => s.notes);
  const schemas = useTags((s) => s.schemas);
  const [query, setQuery] = useState("");
  const [making, setMaking] = useState(false);
  useEffect(() => {
    void useTags.getState().load();
  }, []);
  const tags = useMemo(() => vaultTags(tagCounts(notes), schemas ?? []), [notes, schemas]);
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const shown = q ? tags.filter((t) => t.tag.toLowerCase().includes(q)) : tags;
  const open = (tag: string, event?: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; button: number }) =>
    useWorkspace.getState().go(tagPlace(tag), event ? howFrom(event) : "here");

  return (
    <div className="kasten-tags-home">
      <header>
        <h1>
          <Icon name="tag" className="mr-2.5 inline size-[26px] align-[-4px] text-muted" />
          Tag Database
        </h1>
        <p>Every tag with its notes. Open one to see it as a table, a board, a list, a gallery or a calendar, or show it inside a page with /database.</p>
      </header>
      <div className="kasten-tags-tools">
        <input type="search" aria-label="Find a tag" placeholder="Find a tag…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="kasten-tagdb-button is-primary" onClick={() => setMaking(true)}>
          New tag
        </button>
      </div>
      {making && (
        <NewTag
          taken={tags.map((t) => t.tag.toLowerCase())}
          onDone={(tag) => {
            setMaking(false);
            if (tag) open(tag);
          }}
        />
      )}
      {shown.length === 0 ? (
        <p className="kasten-tag-empty">{tags.length === 0 ? "No tags yet. Add #tags to notes, or make one here." : `No tag matches “${query.trim()}”.`}</p>
      ) : (
        <ul className="kasten-tags-grid" aria-label="Tags">
          {shown.map(({ tag, count, schema }) => {
            const props = schema?.properties ?? [];
            const views = schema ? viewsOf(schema).length : 0;
            return (
              <li key={tag}>
                <button type="button" onClick={(e) => open(tag, e)} onAuxClick={(e) => e.button === 1 && useWorkspace.getState().go(tagPlace(tag), "tab")}>
                  <span className="kasten-tagdb-chip" style={chipStyle(swatch(schema?.color))}>
                    #{tag}
                  </span>
                  <span className="kasten-tags-count">
                    {count.toLocaleString()} {count === 1 ? "note" : "notes"}
                  </span>
                  <span className="kasten-tags-props">{props.length > 0 ? props.map((p) => p.key).join(" · ") : "No properties yet"}</span>
                  {views > 0 && (
                    <span className="kasten-tags-views">
                      {views} {views === 1 ? "view" : "views"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A name for a new tag; it gets a schema file so it has a database at once. */
function NewTag({ taken, onDone }: { taken: string[]; onDone: (tag: string | null) => void }) {
  const [name, setName] = useState("");
  const clean = name.trim().replace(/^#+/, "").trim();
  const clash = taken.includes(clean.toLowerCase());
  const make = async () => {
    if (!clean || clash) return;
    const done = await useTags.getState().saveProperties(clean, []);
    onDone(done ? clean : null);
  };
  return (
    <form
      className="kasten-tagdb-new"
      onSubmit={(e) => {
        e.preventDefault();
        void make();
      }}
    >
      <input
        autoFocus
        aria-label="New tag name"
        aria-invalid={clash}
        placeholder="Tag name, e.g. reading"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
      />
      <button type="submit" disabled={!clean || clash}>
        {clash ? "Already a tag" : "Make it"}
      </button>
    </form>
  );
}
