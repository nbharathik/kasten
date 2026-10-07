// Find in a PDF: the pages that hold what is typed, stepped through with
// Enter (Shift+Enter back), each found place marked on its page. Escape
// closes it and takes the marks away.

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "../../../ui/Button";
import { findPages } from "./pdf-text";

interface Props {
  doc: PDFDocumentProxy;
  /** What is looked for, for the pages to mark. */
  onQuery(query: string): void;
  onGo(page: number): void;
  onClose(): void;
}

export function PdfFind({ doc, onQuery, onGo, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<{ page: number; count: number }[] | null>(null);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // A short pause after typing, then every page is searched.
  useEffect(() => {
    onQuery(query.trim());
    if (!query.trim()) return setPages(null);
    let live = true;
    const timer = setTimeout(() => {
      void findPages(doc, query).then((found) => {
        if (!live) return;
        setPages(found);
        setAt(0);
        if (found[0]) onGo(found[0].page);
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // onQuery and onGo are the reader's, and stay the same.
  }, [doc, query]);

  const step = (by: 1 | -1) => {
    if (!pages?.length) return;
    const next = (at + by + pages.length) % pages.length;
    setAt(next);
    onGo(pages[next]!.page);
  };
  const total = pages?.reduce((n, p) => n + p.count, 0) ?? 0;
  const status = !query.trim() ? "" : pages === null ? "Finding…" : pages.length === 0 ? "No results" : `${total} on ${pages.length} ${pages.length === 1 ? "page" : "pages"} · page ${pages[at]!.page}`;
  const close = () => {
    onQuery("");
    onClose();
  };

  return (
    <div className="kasten-reader-find" role="search" aria-label="Find in this PDF">
      <input
        ref={input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        placeholder="Find in this PDF…"
        aria-label="Find in this PDF"
      />
      <span className="kasten-reader-find-count" aria-live="polite">
        {status}
      </span>
      <IconButton icon="chevron-up" size="sm" label="Previous page with a match" disabled={!pages?.length} onClick={() => step(-1)} />
      <IconButton icon="chevron-down" size="sm" label="Next page with a match" disabled={!pages?.length} onClick={() => step(1)} />
      <IconButton icon="close" size="sm" label="Close find" onClick={close} />
    </div>
  );
}
