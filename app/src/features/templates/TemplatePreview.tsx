// A read-only look at a template before using it: headings, callouts,
// toggles, lists, to-dos and tables drawn from its Markdown, much as the
// page will show them. Only the blocks templates use; no HTML is injected.

import type { ReactNode } from "react";

import { fillTemplate, localStamp } from "./template-vars";
import { splitFrontmatter } from "../pages/markdown/frontmatter";
import { IconOrEmoji } from "../../ui/IconOrEmoji";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "callout"; tone: string; title: string; lines: string[] }
  | { kind: "toggle"; summary: string }
  | { kind: "item"; depth: number; marker: "bullet" | "number" | "todo" | "done"; n: number; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "para"; text: string };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** The template's body as blocks, with placeholders filled in. */
export function previewBlocks(markdown: string, now: string): Block[] {
  const body = fillTemplate(splitFrontmatter(markdown).body, "Untitled", now, "");
  const lines = body.split(/\r?\n/);
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed === "</details>" || trimmed === "<details>") continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(trimmed);
    const summary = /<summary>(.*?)<\/summary>/.exec(trimmed);
    const item = /^(\s*)(?:([-*+])\s+\[([ xX])\]|([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (heading) out.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
    else if (callout) {
      const body: string[] = [];
      while (lines[i + 1]?.trim().startsWith(">")) body.push(lines[++i]!.trim().replace(/^>\s?/, ""));
      out.push({ kind: "callout", tone: callout[1]!.toLowerCase(), title: callout[2]!, lines: body });
    } else if (summary) {
      out.push({ kind: "toggle", summary: summary[1]! });
      // A toggle's inside stays folded, as on the page.
      let depth = 1;
      while (i + 1 < lines.length && depth > 0) {
        const next = lines[++i]!.trim();
        if (next.startsWith("<details")) depth++;
        if (next === "</details>") depth--;
      }
    } else if (trimmed.startsWith("|") && lines[i + 1]?.trim().match(/^\|?\s*:?-{1,}/)) {
      const head = cells(trimmed);
      const rows: string[][] = [];
      i++;
      while (lines[i + 1]?.trim().startsWith("|")) rows.push(cells(lines[++i]!));
      out.push({ kind: "table", head, rows });
    } else if (item) {
      const [, indent, , box, , number, text] = item;
      const marker = box !== undefined ? (box === " " ? "todo" : "done") : number ? "number" : "bullet";
      out.push({ kind: "item", depth: Math.floor(indent!.length / 2), marker, n: Number(number ?? 0), text: text! });
    } else out.push({ kind: "para", text: trimmed });
  }
  return out;
}

/** Bold, italic, code, strike and [[links]] as elements. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\[\[[^\]]+\]\]|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <s key={i}>{part.slice(2, -2)}</s>;
    if (part.startsWith("[[") && part.endsWith("]]")) return <span key={i} className="kasten-tp-link">{part.slice(2, -2)}</span>;
    if (part.length > 2 && ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_")))) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const CALLOUT_ICON: Record<string, string> = { tip: "💡", note: "📝", info: "ℹ️", warning: "⚠️", danger: "⛔", success: "✅", question: "❓" };

export function TemplatePreview({ markdown, title, icon }: { markdown: string; title: string; icon: string }) {
  const blocks = previewBlocks(markdown, localStamp());
  return (
    <article className="kasten-tp" aria-label={`Preview of ${title}`}>
      <div className="kasten-tp-icon" aria-hidden="true">
        <IconOrEmoji icon={icon} />
      </div>
      <h1 className="kasten-tp-title">{title}</h1>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading":
            return block.level === 1 ? <h2 key={i}>{inline(block.text)}</h2> : <h3 key={i}>{inline(block.text)}</h3>;
          case "callout":
            return (
              <div key={i} className={`kasten-tp-callout is-${block.tone}`}>
                <span aria-hidden="true">{CALLOUT_ICON[block.tone] ?? "💬"}</span>
                <div>
                  {block.title && <strong>{inline(block.title)}</strong>}
                  {block.lines.map((line, j) => (
                    <p key={j}>{inline(line)}</p>
                  ))}
                </div>
              </div>
            );
          case "toggle":
            return (
              <p key={i} className="kasten-tp-toggle">
                <span aria-hidden="true">▸</span> {inline(block.summary)}
              </p>
            );
          case "item":
            return (
              <p key={i} className={`kasten-tp-item is-${block.marker}`} style={{ marginLeft: `${block.depth * 20}px` }}>
                <span className="kasten-tp-marker" aria-hidden="true">
                  {block.marker === "todo" ? "☐" : block.marker === "done" ? "☑" : block.marker === "number" ? `${block.n}.` : "•"}
                </span>
                <span>{inline(block.text)}</span>
              </p>
            );
          case "table":
            return (
              <table key={i}>
                <thead>
                  <tr>
                    {block.head.map((cell, j) => (
                      <th key={j}>{inline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, j) => (
                        <td key={j}>{inline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return <p key={i}>{inline(block.text)}</p>;
        }
      })}
    </article>
  );
}
