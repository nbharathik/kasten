// A version's Markdown as readable text in the History tab:
// headings, paragraphs, lists and to-dos, quotes and callouts, code, rules
// and tables, with bold, italics, code, links and page links inline. It is
// for reading only. It builds React elements, never HTML, so what a file
// holds cannot run, and HTML in the text shows as its text.

import "./readable.css";

import { Fragment, type ReactNode } from "react";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "item"; depth: number; ordered: string | null; task: boolean | null; text: string }
  | { kind: "quote"; callout: string | null; title: string; lines: string[] }
  | { kind: "code"; lines: string[] }
  | { kind: "rule" }
  | { kind: "table"; rows: string[][] };

const FENCE = /^\s*(```|~~~)/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const CALLOUT = /^\[!(\w+)\][+-]?\s*(.*)$/;

/** Markdown's blocks, line by line; anything unknown is a paragraph. */
export function blocksOf(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "paragraph", lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]!); i++) code.push(lines[i]!);
      out.push({ kind: "code", lines: code });
      continue;
    }
    if (line.trim() === "" || /^\s*<\/?details>\s*$/.test(line)) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const summary = /^\s*<summary>(.*)<\/summary>\s*$/.exec(line);
    const item = ITEM.exec(line);
    if (heading || summary) {
      flush();
      out.push({ kind: "heading", level: heading ? heading[1]!.length : 4, text: heading ? heading[2]! : `▸ ${summary![1]}` });
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push({ kind: "rule" });
    } else if (item) {
      flush();
      const task = item[3] === undefined ? null : item[3] !== " ";
      out.push({ kind: "item", depth: Math.floor(item[1]!.replace(/\t/g, "  ").length / 2), ordered: /\d/.test(item[2]!) ? item[2]! : null, task, text: item[4]! });
    } else if (line.startsWith(">")) {
      flush();
      const quoted: string[] = [];
      for (; i < lines.length && lines[i]!.startsWith(">"); i++) quoted.push(lines[i]!.replace(/^>\s?/, ""));
      i--;
      const callout = CALLOUT.exec(quoted[0] ?? "");
      out.push({ kind: "quote", callout: callout ? callout[1]!.toLowerCase() : null, title: callout ? callout[2]! : "", lines: callout ? quoted.slice(1) : quoted });
    } else if (line.trimStart().startsWith("|")) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && lines[i]!.trimStart().startsWith("|"); i++) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      i--;
      out.push({ kind: "table", rows });
    } else para.push(line);
  }
  flush();
  return out;
}

/** Inline Markdown, in order of precedence. No lookbehind, which older
 * WebKit webviews reject: `_italics_` match the character before them too,
 * which must not be a letter, a digit or `_`, and give it back as text. */
const INLINE =
  /(`[^`]+`)|(!?\[\[[^\]]+\]\])|(!?\[[^\]]*\]\([^)]*\))|(\*\*[^*]+\*\*|__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*)|(\$[^$\s][^$]*\$)|(<\/?[a-zA-Z][^>]*>)|(?:(^|[^\p{L}\p{N}_])(_[^_\s](?:[^_]*[^_\s])?_)(?![\p{L}\p{N}]))/gu;

/** A line's inline Markdown as React nodes. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index;
    if (at > last) out.push(text.slice(last, at));
    last = at + m[0].length;
    const [all, code, wiki, link, bold, strike, italic, math, , before, underlined] = m;
    const key = out.length;
    if (code) out.push(<code key={key}>{code.slice(1, -1)}</code>);
    else if (wiki) {
      const inside = wiki.replace(/^!?\[\[|\]\]$/g, "");
      const [target, alias] = inside.split("|");
      out.push(
        <span key={key} className="kasten-readable-link">
          {wiki.startsWith("!") ? `Embedded: ${target}` : (alias ?? target)}
        </span>,
      );
    } else if (link) {
      const label = /^!?\[([^\]]*)\]/.exec(link)![1]!;
      out.push(
        <span key={key} className="kasten-readable-link">
          {link.startsWith("!") ? `Image${label ? `: ${label}` : ""}` : inline(label)}
        </span>,
      );
    } else if (bold) out.push(<strong key={key}>{inline(bold.slice(2, -2))}</strong>);
    else if (strike) out.push(<s key={key}>{inline(strike.slice(2, -2))}</s>);
    else if (italic) out.push(<em key={key}>{inline(italic.slice(1, -1))}</em>);
    else if (underlined) out.push(before ?? "", <em key={key}>{inline(underlined.slice(1, -1))}</em>);
    else if (math) out.push(<code key={key}>{math.slice(1, -1)}</code>);
    // A tag, such as a colour's <span>: its text stays, the tag goes.
    else if (all.startsWith("<")) continue;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A paragraph's lines: one flowing text, as Markdown reads them, broken
 * only after two spaces or a backslash. */
function Lines({ lines }: { lines: string[] }) {
  return lines.map((line, i) => {
    const hard = i > 0 && /( {2}|\\)$/.test(lines[i - 1]!);
    return (
      <Fragment key={i}>
        {i > 0 && (hard ? <br /> : " ")}
        {inline(line.replace(/( {2,}|\\)$/, "").trimStart())}
      </Fragment>
    );
  });
}

/** Markdown drawn for reading. */
export function ReadableText({ markdown }: { markdown: string }) {
  return (
    <div className="kasten-readable">
      {blocksOf(markdown).map((block, i) => {
        switch (block.kind) {
          case "heading": {
            const Tag = block.level <= 1 ? "h3" : block.level === 2 ? "h4" : "h5";
            return <Tag key={i}>{inline(block.text)}</Tag>;
          }
          case "item":
            return (
              <div key={i} className={`kasten-readable-item${block.task ? " is-done" : ""}`} style={{ paddingLeft: `${block.depth * 18 + 20}px` }}>
                <span className="kasten-readable-mark" aria-hidden="true">
                  {block.task === null ? (block.ordered ?? "•") : block.task ? "☑" : "☐"}
                </span>
                {inline(block.text)}
              </div>
            );
          case "quote":
            return (
              <blockquote key={i} className={block.callout ? `is-callout is-${block.callout}` : undefined}>
                {block.callout && <strong className="kasten-readable-title">{block.title ? inline(block.title) : block.callout.charAt(0).toUpperCase() + block.callout.slice(1)}</strong>}
                {block.lines.length > 0 && (
                  <p>
                    <Lines lines={block.lines} />
                  </p>
                )}
              </blockquote>
            );
          case "code":
            return <pre key={i}>{block.lines.join("\n")}</pre>;
          case "rule":
            return <hr key={i} />;
          case "table":
            return (
              <table key={i}>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (r === 0 ? <th key={c}>{inline(cell)}</th> : <td key={c}>{inline(cell)}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return (
              <p key={i}>
                <Lines lines={block.lines} />
              </p>
            );
        }
      })}
    </div>
  );
}
