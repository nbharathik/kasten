// The Highlights view's library: each PDF as a book, with how much of it is
// highlighted, in which colours. A click opens the reader.

import type { MouseEvent } from "react";

import type { Highlight, HighlightColor, SourceInfo } from "../../../lib/vault/types";
import { colorOf, HIGHLIGHT_COLORS } from "../colors";

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A steady cover colour of the book's own. */
function cover(title: string): string {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 48% 52%), hsl(${(hue + 36) % 360} 52% 40%))`;
}

interface Props {
  sources: readonly SourceInfo[];
  highlights: Record<string, Highlight[] | undefined>;
  onOpen(path: string, event: MouseEvent): void;
}

export function Library({ sources, highlights, onOpen }: Props) {
  return (
    <section className="kasten-hls-library" aria-label="PDFs">
      <ul>
        {sources.map((source) => {
          const list = highlights[source.path] ?? [];
          const total = list.length || source.highlights;
          const cards = list.filter((h) => h.card).length;
          const by = new Map<HighlightColor, number>();
          for (const h of list) by.set(colorOf(h.color), (by.get(colorOf(h.color)) ?? 0) + 1);
          return (
            <li key={source.path}>
              <button type="button" className="kasten-hls-book" onClick={(e) => onOpen(source.path, e)} title={`Open ${source.title}`}>
                <span className="kasten-hls-cover" style={{ background: cover(source.title) }} aria-hidden="true">
                  <span>{source.title}</span>
                </span>
                <span className="kasten-hls-book-body">
                  <span className="kasten-hls-book-title">{source.title}</span>
                  <span className="kasten-hls-book-detail">
                    {count(total, "highlight")}
                    {cards > 0 ? ` · ${count(cards, "card")}` : ""}
                  </span>
                  {list.length > 0 && (
                    <span className="kasten-hls-mix" aria-hidden="true">
                      {HIGHLIGHT_COLORS.filter((c) => by.has(c)).map((c) => (
                        <span key={c} style={{ flexGrow: by.get(c), background: `var(--swatch-${c})` }} />
                      ))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
