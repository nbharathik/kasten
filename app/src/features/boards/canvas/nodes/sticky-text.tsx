// A sticky's Markdown, drawn simply: headings, lists, to-dos, quotes and
// **bold**, *italic*, `code` and [[links]] inline. No HTML is ever taken
// from the text; everything is built as React elements.

import type { ReactNode } from "react";

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\([^)\n]*\)|\*[^*\n]+\*|_[^_\n]+_)/g;

/** Bold, italic, code and links within one line. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (token.startsWith("**") || token.startsWith("__")) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[[")) out.push(<span key={key++} className="kasten-sticky-link">{token.slice(2, -2).split("|").pop()}</span>);
    else if (token.startsWith("[")) out.push(<span key={key++} className="kasten-sticky-link">{token.slice(1, token.indexOf("]"))}</span>);
    else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The sticky's text as blocks. */
export function StickyText({ text }: { text: string }) {
  if (!text.trim()) return <p className="kasten-sticky-empty">Empty sticky</p>;
  const lines = text.split(/\r?\n/);
  return (
    <div className="kasten-sticky-text">
      {lines.map((line, i) => {
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) return <p key={i} className={`kasten-sticky-h${heading[1]!.length}`}>{inline(heading[2]!)}</p>;
        const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
        if (task) {
          const done = task[1] !== " ";
          return (
            <p key={i} className={`kasten-sticky-task${done ? " is-done" : ""}`}>
              <span aria-hidden="true">{done ? "☑" : "☐"}</span> {inline(task[2]!)}
            </p>
          );
        }
        const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
        if (bullet) return <p key={i} className="kasten-sticky-bullet">{inline(bullet[1]!)}</p>;
        const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
        if (numbered) return <p key={i} className="kasten-sticky-numbered" data-n={`${numbered[1]}.`}>{inline(numbered[2]!)}</p>;
        const quote = /^>\s?(.*)$/.exec(line);
        if (quote) return <p key={i} className="kasten-sticky-quote">{inline(quote[1]!)}</p>;
        if (!line.trim()) return <p key={i} className="kasten-sticky-gap" aria-hidden="true" />;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}
