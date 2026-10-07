import type { RemarkProcessor } from "../remark-context";
// `$…$` and `$$…$$`, read as Pandoc and Obsidian read them.
// remark-math finds the candidates; an inline span whose dollars touch a space
// on the inside, or whose closing dollar comes right before a digit, goes back
// to being the text it was, so "$5 and $10" stays two prices. Inline math keeps
// its dollars and the exact text between them, so it saves as it was written.

import { $remark } from "@milkdown/kit/utils";
import remarkMath from "remark-math";

import { eachParent, type MdNode } from "./mdast";

/** How many dollars fence `raw`: two for `$$…$$`, else one. */
function fence(raw: string): 1 | 2 {
  return raw.length > 4 && raw.startsWith("$$") && raw.endsWith("$$") ? 2 : 1;
}

/** Whether `raw`, dollars included, is inline math; `next` is the character after it. */
export function validInline(raw: string, next: string): boolean {
  const dollars = fence(raw);
  const inner = raw.slice(dollars, raw.length - dollars);
  if (raw.length < 3 || !inner.trim()) return false;
  if (dollars === 2) return true;
  return !/^\s/.test(inner) && !/\s$/.test(inner) && !/^\d/.test(next);
}

/** Where in plain `text` a dollar would open math, so writing it needs `\$`:
 * a single `$` with a closing one ahead under Pandoc's rule, and runs of `$$`. */
export function mathOpenings(text: string): number[] {
  const opens: number[] = [];
  let i = text.indexOf("$");
  while (i >= 0) {
    if (text[i + 1] === "$") {
      opens.push(i);
      i = text.indexOf("$", i + 2);
      continue;
    }
    const close = text.indexOf("$", i + 1);
    if (close < 0) break;
    if (validInline(text.slice(i, close + 1), text.charAt(close + 1))) {
      opens.push(i);
      i = text.indexOf("$", close + 1);
    } else {
      i = close;
    }
  }
  return opens;
}

/** remark-math, under Kasten's own name (Crepe's math feature stays off). */
export const remarkMathSyntax = $remark("kastenMathSyntax", () => remarkMath);

/** Checks every inline span against Pandoc's rule, and writes math back as read. */

export const remarkKastenMath = $remark("kastenMath", () => function (this: RemarkProcessor) {
  const data = this.data();
  (data.toMarkdownExtensions ??= []).push({
    handlers: {
      inlineMath: (node: MdNode) => {
        const dollars = "$".repeat(Number(node.dollars ?? 1));
        return dollars + (node.value ?? "") + dollars;
      },
    },
  });
  return (tree: unknown, file: { value?: unknown }) => {
    const src = String(file.value ?? "");
    eachParent(tree as MdNode, (parent) => {
      if (!parent.children.some((child) => child.type === "inlineMath")) return;
      const out: MdNode[] = [];
      for (const child of parent.children) {
        const node = child.type === "inlineMath" ? checked(child, src) : child;
        const last = out[out.length - 1];
        if (node.type === "text" && last?.type === "text") out[out.length - 1] = { ...last, value: `${last.value ?? ""}${node.value ?? ""}` };
        else out.push(node);
      }
      parent.children = out;
    });
  };
});

/** An inline span as math with its dollars, or back to text when it is not math. */
function checked(node: MdNode, src: string): MdNode {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const raw = start !== undefined && end !== undefined ? src.slice(start, end) : `$${node.value ?? ""}$`;
  const dollars = fence(raw);
  const inner = raw.slice(dollars, raw.length - dollars);
  const text = inner.includes("\n") ? unprefixed(inner, node.value ?? "") : inner;
  const marks = "$".repeat(dollars);
  if (!validInline(raw, end !== undefined ? src.charAt(end) : "")) return { type: "text", value: marks + text + marks, position: node.position };
  return { ...node, dollars, value: text };
}

/** The text between dollars that cross lines. The source holds the quote's
 * `> ` or the list's indent on the later lines; remark's `value` has the text
 * without them, less the one space or line break it takes off each end when
 * both ends have one, which go back. */
function unprefixed(inner: string, value: string): string {
  const edge = /[ \r\n]/;
  const first = inner.charAt(0);
  const last = inner.charAt(inner.length - 1);
  return value.trim() && edge.test(first) && edge.test(last) ? first + value + last : value;
}
