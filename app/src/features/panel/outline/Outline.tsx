// The page's outline, its headings from the live editor, and facts about
// the page: counts, dates and where its file is.

import "./outline.css";

import { memo, useEffect, useState, type RefObject } from "react";

import { relativeTime, stampDay } from "../../../lib/dates";
import { scrollMotion } from "../../../lib/motion";
import type { NoteMeta } from "../../../lib/vault/types";
import { countWords, headingsIn, pageText, type Heading } from "../../workspace/page/page-dom";

type Root = RefObject<HTMLDivElement | null>;

/** What `read` makes of the page, read again once the page settles: the
 * editor renders after the panel and changes as you type. */
function usePageRead<T>(root: Root, read: (page: HTMLElement) => T, initial: T): T {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const page = root.current;
    if (!page) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      timer = null;
      setValue(read(page));
    };
    update();
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(update, 200);
    });
    observer.observe(page, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [root, read]);
  return value;
}


const NO_HEADINGS: Heading[] = [];

export const Outline = memo(function Outline({ root }: { root: Root }) {
  const headings = usePageRead(root, headingsIn, NO_HEADINGS);
  const top = Math.min(...headings.map((h) => h.level), 3);
  return (
    <section className="kasten-panel-section" aria-label="Outline">
      <h3 className="kasten-panel-label">Outline</h3>
      {headings.length === 0 ? (
        <p className="kasten-panel-empty">Add headings to see an outline.</p>
      ) : (
        <ol className="kasten-outline">
          {headings.map((h, i) => (
            <li key={i} style={{ paddingLeft: `${(h.level - top) * 14}px` }}>
              <button type="button" className={`is-h${h.level}`} onClick={() => h.element.scrollIntoView({ behavior: scrollMotion(), block: "start" })}>
                {h.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});

export const PageFacts = memo(function PageFacts({ note, root }: { note: NoteMeta; root: Root }) {
  const counts = countWords(usePageRead(root, pageText, ""));
  return (
    <section className="kasten-panel-section" aria-label="About this page">
      <h3 className="kasten-panel-label">Page</h3>
      <dl className="kasten-facts">
        <dt>Words</dt>
        <dd>{counts.words.toLocaleString()}</dd>
        <dt>Characters</dt>
        <dd>{counts.characters.toLocaleString()}</dd>
        <dt>Reading time</dt>
        <dd>{counts.minutes ? `${counts.minutes} min` : "–"}</dd>
        <dt>Created</dt>
        <dd>{note.created ? stampDay(note.created) || note.created.slice(0, 10) : "–"}</dd>
        <dt>Edited</dt>
        <dd title={note.modified ? new Date(note.modified).toLocaleString() : undefined}>{note.modified ? relativeTime(note.modified) : "–"}</dd>
        <dt>File</dt>
        <dd className="kasten-facts-path">{note.path}</dd>
      </dl>
    </section>
  );
});
