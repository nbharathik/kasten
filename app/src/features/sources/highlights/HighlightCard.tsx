// One highlight in the Highlights view: the quote in its colour, with its
// note, page, card and the card's tags. The quote opens the reader at its
// spot; it drags onto a board as its card; Copy puts it on the clipboard as
// a Markdown quote with where it came from.

import { useState, type MouseEvent } from "react";

import type { Highlight, NoteMeta } from "../../../lib/vault/types";
import { Icon } from "../../../ui/Icon";
import { dragHighlights } from "../../workspace/drag";
import { titleOf } from "../../workspace/names";
import { howFrom, useWorkspace } from "../../workspace/store";
import { colorOf } from "../colors";
import { showSpot } from "../highlight-request";
import { useSources } from "../store";
import { IconOrEmoji } from "../../../ui/IconOrEmoji";
import { lineIcon } from "../../../ui/glyph";

interface Props {
  source: string;
  sourceTitle: string;
  highlight: Highlight;
  card: NoteMeta | undefined;
  /** Shows which PDF it is from, in a list of many. */
  showSource?: boolean;
}

export function HighlightCard({ source, sourceTitle, highlight: h, card, showSource = false }: Props) {
  const [copied, setCopied] = useState(false);
  const open = (e: MouseEvent) => showSpot({ source, page: h.page, highlight: h.id }, howFrom(e));
  const copy = () => {
    const quote = h.text.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
    void navigator.clipboard?.writeText(`${quote}\n\n— ${sourceTitle}, p. ${h.page}${h.comment ? `\n\n${h.comment}` : ""}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className={`kasten-hls-row is-${colorOf(h.color)}`} draggable onDragStart={(e) => dragHighlights(e, [{ source, id: h.id }])}>
      <button type="button" className="kasten-hls-quote" onClick={open} title="Open at this spot">
        <span className="kasten-hls-text">{h.text}</span>
        {h.comment && <span className="kasten-hls-comment">{h.comment}</span>}
      </button>
      <div className="kasten-hls-meta">
        <span className="kasten-hls-page">Page {h.page}</span>
        {showSource && (
          <span className="kasten-hls-from">
            <IconOrEmoji icon={lineIcon("book")} /> {sourceTitle}
          </span>
        )}
        {card && (
          <span className="kasten-hls-card" title={`Its card: ${titleOf(card)}`}>
            <IconOrEmoji icon={lineIcon("card")} /> {titleOf(card)}
          </span>
        )}
        {card?.tags.map((t) => (
          <span key={t} className="kasten-hls-tagchip">
            #{t}
          </span>
        ))}
        <span className="kasten-hls-spacer" />
        <button type="button" onClick={copy} title="Copy as a quote">
          <Icon name={copied ? "check" : "copy"} className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
        {h.card ? (
          <button type="button" onClick={(e) => useWorkspace.getState().openPath(h.card!, howFrom(e))}>
            Open card
          </button>
        ) : (
          <button type="button" className="is-strong" onClick={() => void useSources.getState().card(source, h.id)}>
            Make card
          </button>
        )}
      </div>
    </div>
  );
}
