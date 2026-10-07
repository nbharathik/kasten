// Speaker notes are Markdown. They are only read, so this draws the little of it that notes use (paragraphs, headings, lists, quotes,
// code, and bold, italic, code and links inside a line) as elements, and never as HTML from a string. A link goes only to a web or mail
// address, so a note in a deck someone sent cannot make a page run a script.

import { type JSX, type ReactNode } from "react";

import "./notes.css";

const SAFE_LINK = /^(https?:|mailto:)/i;

/** A line's words as elements: `**bold**`, `*italic*`, `` `code` ``, `~~struck~~` and `[a link](https://…)`. */
export function inline(text: string, keyBase = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`+)([^`]+?)\1|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let at = 0;
  let n = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) out.push(text.slice(at, match.index));
    const key = `${keyBase}${n++}`;
    if (match[2] !== undefined) out.push(<code key={key}>{match[2]}</code>);
    else if (match[3] !== undefined || match[4] !== undefined) out.push(<strong key={key}>{inline(match[3] ?? match[4] ?? "", `${key}.`)}</strong>);
    else if (match[5] !== undefined) out.push(<s key={key}>{inline(match[5], `${key}.`)}</s>);
    else if (match[6] !== undefined || match[7] !== undefined) out.push(<em key={key}>{inline(match[6] ?? match[7] ?? "", `${key}.`)}</em>);
    else if (match[8] !== undefined && match[9] !== undefined) {
      out.push(
        SAFE_LINK.test(match[9]) ? (
          <a key={key} href={match[9]} target="_blank" rel="noopener noreferrer">
            {inline(match[8], `${key}.`)}
          </a>
        ) : (
          match[0]
        ),
      );
    }
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** A paragraph's lines, joined by line breaks. */
function lines(rows: string[], key: string): ReactNode[] {
  return rows.flatMap((row, i) => (i === 0 ? inline(row, `${key}.0.`) : [<br key={`${key}.br${i}`} />, ...inline(row, `${key}.${i}.`)]));
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Markdown notes as elements. */
export function Notes({ markdown }: { markdown: string }): JSX.Element {
  const rows = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i] ?? "";
    const key = `b${blocks.length}`;
    if (row.trim() === "") {
      i++;
    } else if (row.trimStart().startsWith("```")) {
      const body: string[] = [];
      for (i++; i < rows.length && !(rows[i] ?? "").trimStart().startsWith("```"); i++) body.push(rows[i] ?? "");
      i++;
      blocks.push(
        <pre key={key}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
    } else if (HEADING.test(row)) {
      const match = HEADING.exec(row);
      const level = Math.min((match?.[1] ?? "#").length + 2, 6);
      const Tag = `h${level}` as "h3" | "h4" | "h5" | "h6";
      blocks.push(<Tag key={key}>{inline(match?.[2] ?? "", `${key}.`)}</Tag>);
      i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(row)) {
      blocks.push(<hr key={key} />);
      i++;
    } else if (BULLET.test(row) || NUMBER.test(row)) {
      const ordered = NUMBER.test(row) && !BULLET.test(row);
      const items: string[] = [];
      for (; i < rows.length; i++) {
        const item = (ordered ? NUMBER : BULLET).exec(rows[i] ?? "");
        if (!item) break;
        items.push(item[1] ?? "");
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key}>
          {items.map((item, n) => (
            <li key={n}>{inline(item, `${key}.${n}.`)}</li>
          ))}
        </List>,
      );
    } else if (row.trimStart().startsWith(">")) {
      const quoted: string[] = [];
      for (; i < rows.length && (rows[i] ?? "").trimStart().startsWith(">"); i++) quoted.push((rows[i] ?? "").replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={key}>{lines(quoted, key)}</blockquote>);
    } else {
      const paragraph: string[] = [];
      for (; i < rows.length; i++) {
        const next = rows[i] ?? "";
        if (next.trim() === "" || HEADING.test(next) || BULLET.test(next) || NUMBER.test(next) || next.trimStart().startsWith("```") || next.trimStart().startsWith(">")) break;
        paragraph.push(next);
      }
      blocks.push(<p key={key}>{lines(paragraph, key)}</p>);
    }
  }
  return <div className="ks-show-notes">{blocks}</div>;
}
