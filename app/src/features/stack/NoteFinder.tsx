import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { Hit } from "../../lib/vault/types";
import { iconOf, titleOf } from "../workspace/names";
import { useWorkspace } from "../workspace/store";
import { openable } from "../workspace/tree";
import { whereIfShared } from "../workspace/where";
import { IconOrEmoji } from "../../ui/IconOrEmoji";
import { lineIcon } from "../../ui/glyph";

interface Found {
  path: string;
  title: string;
  icon: string;
  /** Where it lives, when other notes share its title. */
  where?: string;
  snippet?: string;
}

/** "Find a card…": titles match as you type, full text after a pause.
 * Enter picks the highlighted note. */
export function NoteFinder({ onPick, placeholder = "Find a card…", autoFocus = false }: { onPick: (path: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const notes = useWorkspace((s) => s.notes);
  const client = useWorkspace((s) => s.client);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [index, setIndex] = useState(0);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  // Full text once typing pauses.
  useEffect(() => {
    if (!client || q.length < 2) return setHits([]);
    let cancelled = false;
    const timer = setTimeout(() => {
      client.search(q, 12).then((found) => !cancelled && setHits(found), () => {});
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, q]);

  const found = useMemo<Found[]>(() => {
    if (!q) return [];
    const byTitle = openable(notes)
      .filter((n) => titleOf(n).toLowerCase().includes(q))
      .sort((a, b) => Number(!titleOf(a).toLowerCase().startsWith(q)) - Number(!titleOf(b).toLowerCase().startsWith(q)) || b.modified - a.modified)
      .slice(0, 8)
      .map((n) => ({ path: n.path, title: titleOf(n), icon: iconOf(n), where: whereIfShared(n, notes) }));
    const seen = new Set(byTitle.map((f) => f.path));
    const byText = hits
      .filter((h) => !seen.has(h.path))
      .slice(0, 6)
      .map((h) => ({ path: h.path, title: h.title, icon: h.icon || lineIcon("page"), snippet: h.snippet }));
    return [...byTitle, ...byText];
  }, [notes, hits, q]);

  const pick = (item: Found | undefined) => {
    if (!item) return;
    onPick(item.path);
    setQuery("");
    setIndex(0);
  };

  return (
    <div className="relative">
      <input
        ref={input}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, found.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(found[index]);
          } else if (e.key === "Escape") setQuery("");
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={found.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={found.length > 0 ? `${id}-${index}` : undefined}
        className="h-9 w-full rounded-lg border border-line bg-canvas px-3 text-13 shadow-sm outline-none placeholder:text-muted focus:border-accent/60"
      />
      {found.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-lg border border-line bg-canvas p-1 shadow-lg">
          {found.map((item, i) => (
            <li key={item.path} id={`${id}-${i}`} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => pick(item)}
                className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left ${i === index ? "bg-line/60" : ""}`}
              >
                <span className="flex items-center gap-2 text-13">
                  <IconOrEmoji icon={item.icon} />
                  <span className="truncate">{item.title}</span>
                  {item.where && <span className="ml-auto shrink-0 truncate text-12 text-muted">{item.where}</span>}
                </span>
                {item.snippet && <span className="line-clamp-1 pl-6 text-12 text-muted">{item.snippet}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
