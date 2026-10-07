// The reader's side list: the source's highlights in reading order, each
// with its colour, text, comment and card. Clicking one scrolls to it.

import type { Highlight } from "../../../lib/vault/types";
import { dragHighlights } from "../../workspace/drag";
import { colorOf } from "../colors";

/** Reading order: by page, then down the page (PDF y grows upwards). */
export function readingOrder(list: readonly Highlight[]): Highlight[] {
  const top = (h: Highlight) => Math.max(...h.rects.map((r) => r[3]), 0);
  const left = (h: Highlight) => (h.rects.length ? Math.min(...h.rects.map((r) => r[0])) : 0);
  return [...list].sort((a, b) => a.page - b.page || top(b) - top(a) || left(a) - left(b));
}

interface Props {
  source: string;
  highlights: readonly Highlight[];
  onPick(highlight: Highlight): void;
}

export function HighlightList({ source, highlights, onPick }: Props) {
  return (
    <aside className="kasten-reader-list" aria-label="Highlights in this PDF">
      <p className="kasten-reader-list-head">
        Highlights <span>{highlights.length}</span>
      </p>
      {highlights.length === 0 ? (
        <p className="kasten-reader-list-empty">Select text on a page to highlight it. Highlights become cards, linked back to their spot.</p>
      ) : (
        <ol>
          {readingOrder(highlights).map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={`kasten-reader-item is-${colorOf(h.color)}`}
                onClick={() => onPick(h)}
                // Onto a board it goes as its card, made if need be.
                draggable
                onDragStart={(e) => dragHighlights(e, [{ source, id: h.id }])}
              >
                <span className="kasten-reader-item-text">{h.text}</span>
                {h.comment && <span className="kasten-reader-item-comment">{h.comment}</span>}
                <span className="kasten-reader-item-meta">
                  Page {h.page}
                  {h.card && <span className="kasten-reader-item-card">· Card</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
