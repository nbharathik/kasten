import type { Reference } from "@kasten-slides/wasm";
import { type JSX, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon } from "../ui/Icon.tsx";
import { matchReferences } from "./match.ts";
import "./citations.css";

/** The most works listed at once: a bibliography of thousands is narrowed by typing, not scrolled. */
const MOST_SHOWN = 200;

export interface ReferenceListProps {
  works: readonly Reference[];
  /** The keys chosen. */
  chosen: ReadonlySet<string>;
  /** A work was clicked, or Enter was pressed on it. */
  onToggle(key: string): void;
  /** What the list is called for assistive technology. */
  label: string;
  /** Takes the focus when it appears. */
  focus?: boolean;
}

/** `Vaswani et al., 2017` and, under it, the title: what a person knows a work by. */
function Line({ work }: { work: Reference }): JSX.Element {
  return (
    <span className="ks-rl-text">
      <span className="ks-rl-who">{work.short}</span>
      <span className="ks-rl-title">{work.title || work.full}</span>
    </span>
  );
}

/**
 * A search box over a bibliography, and the works under it that match, to choose from. The arrow keys walk the
 * list and Enter chooses (or takes back) the one in view; a click does the same.
 */
export function ReferenceList({ works, chosen, onToggle, label, focus = false }: ReferenceListProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const uid = useId();
  const matches = useMemo(() => matchReferences(works, query), [works, query]);
  const shown = matches.slice(0, MOST_SHOWN);
  const active = Math.min(at, Math.max(shown.length - 1, 0));
  const current = shown[active];
  const optionId = (work: Reference) => `${uid}-${work.key.replace(/[^\w-]/g, "_")}`;

  useEffect(() => {
    if (current) document.getElementById(optionId(current))?.scrollIntoView?.({ block: "nearest" });
  }, [current?.key]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (shown.length > 0) setAt((active + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      onToggle(current.key);
    }
  };

  return (
    <div className="ks-rl">
      <div className="ks-rl-search">
        <Icon name="search" size={16} />
        <input
          ref={search}
          className="ks-rl-input"
          role="combobox"
          aria-label={`Search ${label}`}
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(current) : undefined}
          placeholder="Search by key, author, title or year…"
          autoComplete="off"
          spellCheck={false}
          data-autofocus={focus ? "" : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setAt(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div id={`${uid}-list`} className="ks-rl-list" role="listbox" aria-multiselectable="true" aria-label={label}>
        {shown.map((work) => (
          <div
            key={work.key}
            id={optionId(work)}
            role="option"
            aria-selected={chosen.has(work.key)}
            className={`ks-rl-row${work === current ? " is-active" : ""}${chosen.has(work.key) ? " is-chosen" : ""}`}
            onMouseMove={() => current !== work && setAt(shown.indexOf(work))}
            // The words of a work and its key are text to select and copy; a press anywhere else in the row keeps the focus in the search box.
            onMouseDown={(event) => {
              if (!(event.target instanceof Element && event.target.closest(".ks-rl-text, .ks-rl-key"))) event.preventDefault();
            }}
            onClick={(event) => {
              // A drag that selected words of the row is not a choice.
              const selection = window.getSelection();
              if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
              onToggle(work.key);
              search.current?.focus({ preventScroll: true });
            }}
          >
            <span className="ks-rl-tick" aria-hidden="true">
              {chosen.has(work.key) ? <Icon name="check" size={14} /> : null}
            </span>
            <Line work={work} />
            <code className="ks-rl-key">{work.key}</code>
          </div>
        ))}
        {shown.length === 0 ? <p className="ks-rl-none">{query.trim() ? `Nothing matches “${query.trim()}”.` : "There are no works in the bibliography."}</p> : null}
      </div>
      <p className="ks-rl-status" role="status">
        {matches.length === 0 ? "No results" : matches.length > shown.length ? `Showing ${shown.length} of ${matches.length}: type to narrow them` : `${matches.length} ${matches.length === 1 ? "work" : "works"}`}
      </p>
    </div>
  );
}
