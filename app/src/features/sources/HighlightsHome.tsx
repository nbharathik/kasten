// The Highlights view: the PDFs as a library, then
// every highlight, grouped by its PDF or newest first, filtered by colour,
// by whether it has a card yet, by the card's tags and by words. A highlight
// opens the reader at its spot, becomes a card, and drags onto a board as
// its card. PDFs come in with Import, Ctrl+O or a drop.

import { useEffect, useMemo, useState } from "react";

import type { Highlight, HighlightColor, NoteMeta } from "../../lib/vault/types";
import { Segmented } from "../../ui/Segmented";
import { howFrom, useWorkspace } from "../workspace/store";
import { COLOR_NAMES, colorOf, HIGHLIGHT_COLORS } from "./colors";
import { HighlightCard } from "./highlights/HighlightCard";
import { Library } from "./highlights/Library";
import { pickPdfs } from "./import";
import { readingOrder } from "./reader/HighlightList";
import { useSources } from "./store";

import "./colors.css";
import "./highlights.css";
import { Icon } from "../../ui/Icon";

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
type Layout = "sources" | "newest";

export function HighlightsHome() {
  const list = useSources((s) => s.list);
  const highlights = useSources((s) => s.highlights);
  const notes = useWorkspace((s) => s.notes);
  const [colors, setColors] = useState<ReadonlySet<HighlightColor>>(new Set());
  const [tag, setTag] = useState("");
  const [words, setWords] = useState("");
  const [uncarded, setUncarded] = useState(false);
  const [layout, setLayout] = useState<Layout>("sources");

  useEffect(() => {
    void useSources.getState().loadAll();
  }, []);

  const byPath = useMemo(() => new Map(notes.map((n) => [n.path, n])), [notes]);
  const cardOf = (h: Highlight): NoteMeta | undefined => (h.card ? byPath.get(h.card) : undefined);
  const all = useMemo(() => (list ?? []).flatMap((source) => (highlights[source.path] ?? []).map((h) => ({ source, h }))), [list, highlights]);
  const tags = useMemo(() => {
    const found = new Set<string>();
    for (const { h } of all) for (const t of (h.card ? byPath.get(h.card)?.tags : undefined) ?? []) found.add(t);
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [all, byPath]);
  const perColor = useMemo(() => {
    const by = new Map<HighlightColor, number>();
    for (const { h } of all) by.set(colorOf(h.color), (by.get(colorOf(h.color)) ?? 0) + 1);
    return by;
  }, [all]);

  const filtering = colors.size > 0 || tag !== "" || words.trim() !== "" || uncarded;
  const wanted = words.trim().toLowerCase();
  const keep = (h: Highlight) =>
    (colors.size === 0 || colors.has(colorOf(h.color))) &&
    (!uncarded || !h.card) &&
    (tag === "" || (cardOf(h)?.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase())) &&
    (wanted === "" || h.text.toLowerCase().includes(wanted) || (h.comment ?? "").toLowerCase().includes(wanted));

  const groups = (list ?? []).map((source) => ({ source, all: highlights[source.path] ?? [], shown: readingOrder((highlights[source.path] ?? []).filter(keep)) })).filter((g) => !filtering || g.shown.length > 0);
  const newest = all.filter(({ h }) => keep(h)).sort((a, b) => (b.h.created ?? "").localeCompare(a.h.created ?? ""));
  const total = (list ?? []).reduce((n, s) => n + (highlights[s.path]?.length ?? s.highlights), 0);
  const carded = all.filter(({ h }) => h.card).length;
  const toggle = (color: HighlightColor) =>
    setColors((now) => {
      const next = new Set(now);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });

  return (
    <div className="kasten-hls">
      <header className="kasten-hls-head">
        <div>
          <h1>Highlights</h1>
          <p>
            <span>{list ? `${count(total, "highlight")} in ${count(list.length, "PDF")}` : "Reading your sources…"}</span>
            {carded > 0 && <span className="kasten-hls-carded"> · {count(carded, "card")}</span>}
          </p>
        </div>
        <button type="button" className="ui-btn is-primary" onClick={pickPdfs} title="Import a PDF (Ctrl+O), or drop one anywhere">
          Import PDF…
        </button>
      </header>

      {list && list.length > 0 && <Library sources={list} highlights={highlights} onOpen={(path, e) => useWorkspace.getState().go({ view: "highlights", path }, howFrom(e))} />}

      {list && list.length > 0 && (
        <div className="kasten-hls-filters" role="toolbar" aria-label="Filters">
          <div className="kasten-hls-colors" role="group" aria-label="Colours">
            {HIGHLIGHT_COLORS.map((color) => (
              <button key={color} type="button" className={`kasten-hls-chip is-${color}`} aria-label={COLOR_NAMES[color]} aria-pressed={colors.has(color)} title={COLOR_NAMES[color]} onClick={() => toggle(color)}>
                <span className={`kasten-hl-swatch is-${color}`} aria-hidden="true" />
                {perColor.get(color) ? <span className="kasten-hls-chip-count">{perColor.get(color)}</span> : null}
              </button>
            ))}
          </div>
          <button type="button" className="kasten-hls-toggle" aria-pressed={uncarded} onClick={() => setUncarded((u) => !u)}>
            No card yet
          </button>
          <select className="kasten-hls-tag" value={tag} aria-label="Tag" onChange={(e) => setTag(e.target.value)} disabled={tags.length === 0}>
            <option value="">{tags.length ? "All tags" : "No tags on cards yet"}</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
          <input className="kasten-hls-find" type="search" value={words} placeholder="Find in highlights…" aria-label="Find in highlights" onChange={(e) => setWords(e.target.value)} />
          <Segmented label="Show" value={layout} onChange={setLayout} choices={[{ value: "sources", label: "By PDF" }, { value: "newest", label: "Newest" }]} />
        </div>
      )}

      {list && list.length === 0 ? (
        <div className="kasten-hls-empty">
          <span aria-hidden="true">
            <Icon name="book" className="size-8" />
          </span>
          <h2>Read and highlight PDFs</h2>
          <p>Drop a PDF anywhere in Kasten, or import one. Select a passage to highlight it; a highlight becomes a card that links back to the exact spot.</p>
          <button type="button" className="ui-btn is-primary" onClick={pickPdfs}>
            Import PDF…
          </button>
        </div>
      ) : layout === "newest" ? (
        <section className="kasten-hls-source" aria-label="Newest highlights">
          {newest.length === 0 ? (
            <p className="kasten-hls-none">No highlights match these filters.</p>
          ) : (
            <ol>
              {newest.map(({ source, h }) => (
                <li key={`${source.path}#${h.id}`}>
                  <HighlightCard source={source.path} sourceTitle={source.title} highlight={h} card={cardOf(h)} showSource />
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        groups.map(({ source, all: every, shown }) => (
          <section key={source.path} className="kasten-hls-source" aria-label={source.title}>
            <header>
              <button type="button" className="kasten-hls-open" onClick={(e) => useWorkspace.getState().go({ view: "highlights", path: source.path }, howFrom(e))}>
                <Icon name="book" className="size-4 text-muted" />
                {source.title}
              </button>
              <span className="kasten-hls-count">{filtering ? `${shown.length} of ${every.length}` : count(every.length, "highlight")}</span>
            </header>
            {shown.length === 0 ? (
              <p className="kasten-hls-none">Nothing highlighted yet. Open it to read and highlight.</p>
            ) : (
              <ol>
                {shown.map((h) => (
                  <li key={h.id}>
                    <HighlightCard source={source.path} sourceTitle={source.title} highlight={h} card={cardOf(h)} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))
      )}
    </div>
  );
}
