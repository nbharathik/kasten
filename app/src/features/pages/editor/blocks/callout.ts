import type { RemarkProcessor } from "../remark-context";
// Callouts, stored as Obsidian-style quotes:
//
//   > [!tip] Optional title
//   > Body blocks.
//
// A blockquote whose first line is `[!kind]`, optionally followed by `+` or `-`
// (foldable) and a title, becomes a callout node. The title stays raw Markdown,
// taken from the source, so it survives edits byte for byte.

import { wrapIn } from "@milkdown/kit/prose/commands";
import type { Node } from "@milkdown/kit/prose/model";
import { $command, $nodeSchema, $remark } from "@milkdown/kit/utils";

import { containsLineBreak, eachParent, type MdNode } from "./mdast";

export interface CalloutKind {
  icon: string;
  label: string;
  /** One of the Notion colour names, for the callout's background. */
  tone: string;
}

/** Obsidian's callout kinds and aliases, with Notion-style icons and tones;
 * a tip looks like Notion's default callout. */
const KINDS: Record<string, CalloutKind> = {
  note: { icon: "📝", label: "Note", tone: "blue" },
  info: { icon: "ℹ️", label: "Info", tone: "blue" },
  todo: { icon: "☑️", label: "To-do", tone: "blue" },
  tip: { icon: "💡", label: "Tip", tone: "gray" },
  hint: { icon: "💡", label: "Hint", tone: "gray" },
  important: { icon: "📌", label: "Important", tone: "purple" },
  abstract: { icon: "📄", label: "Abstract", tone: "blue" },
  summary: { icon: "📄", label: "Summary", tone: "blue" },
  success: { icon: "✅", label: "Success", tone: "green" },
  done: { icon: "✅", label: "Done", tone: "green" },
  question: { icon: "❓", label: "Question", tone: "yellow" },
  faq: { icon: "❓", label: "FAQ", tone: "yellow" },
  warning: { icon: "⚠️", label: "Warning", tone: "orange" },
  caution: { icon: "⚠️", label: "Caution", tone: "orange" },
  failure: { icon: "❌", label: "Failure", tone: "red" },
  danger: { icon: "⛔", label: "Danger", tone: "red" },
  error: { icon: "⛔", label: "Error", tone: "red" },
  bug: { icon: "🐞", label: "Bug", tone: "red" },
  example: { icon: "🧪", label: "Example", tone: "purple" },
  quote: { icon: "💬", label: "Quote", tone: "gray" },
};

/** The kinds offered in the picker, in order. Others still display. */
export const PICKER_KINDS = ["note", "tip", "info", "important", "success", "question", "warning", "danger", "bug", "example", "quote"];

export function calloutKind(kind: string): CalloutKind {
  return KINDS[kind.toLowerCase()] ?? { icon: "💡", label: kind || "Callout", tone: "gray" };
}

export interface CalloutAttrs {
  kind: string;
  fold: string;
  title: string;
}

/** A callout from pasted HTML, as its header line can hold it: a kind of
 * letters, digits and dashes, a fold of `+`, `-` or none, and a title on
 * one line. */
export function pastedCallout(data: DOMStringMap): CalloutAttrs {
  const kind = /^[A-Za-z][\w-]*$/.test(data.callout ?? "") ? data.callout! : "note";
  const fold = data.fold === "+" || data.fold === "-" ? data.fold : "";
  return { kind, fold, title: (data.title ?? "").replace(/[\r\n]+/g, " ").trim() };
}

export function calloutHeader({ kind, fold, title }: CalloutAttrs): string {
  return `[!${kind}]${fold}${title ? ` ${title}` : ""}`;
}

const HEADER = /^\[!([A-Za-z][\w-]*)\]([+-]?)(?:[ \t]+(.*?))?[ \t]*$/;

/** The first paragraph without its first line, null if nothing is left, or
 * undefined if that line break sits inside inline markup. */
function withoutFirstLine(paragraph: MdNode): MdNode | null | undefined {
  const kids = paragraph.children ?? [];
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i]!;
    if (kid.type === "break") {
      const rest = kids.slice(i + 1);
      return rest.length ? { ...paragraph, children: rest } : null;
    }
    if (kid.type === "text" && kid.value?.includes("\n")) {
      const tail = kid.value.slice(kid.value.indexOf("\n") + 1);
      const rest = [...(tail ? [{ ...kid, value: tail }] : []), ...kids.slice(i + 1)];
      return rest.length ? { ...paragraph, children: rest } : null;
    }
    if (containsLineBreak(kid)) return undefined;
  }
  return null;
}

function toCallout(quote: MdNode, src: string): MdNode | null {
  const first = quote.children?.[0];
  const start = first?.position?.start.offset;
  if (!first || first.type !== "paragraph" || start === undefined) return null;
  // The source line decides: an escaped `\[!note]` stays a plain quote.
  const match = HEADER.exec(src.slice(start).split(/\r?\n/, 1)[0] ?? "");
  if (!match) return null;
  const body = withoutFirstLine(first);
  if (body === undefined) return null;
  return {
    type: "callout",
    kind: match[1],
    fold: match[2] ?? "",
    title: match[3] ?? "",
    children: [...(body ? [body] : []), ...(quote.children ?? []).slice(1)],
    position: quote.position,
  };
}


export const remarkCallout = $remark("kastenCallout", () => function (this: RemarkProcessor) {
  const data = this.data();
  (data.toMarkdownExtensions ??= []).push({
    handlers: { calloutHeader: (node: MdNode) => node.value ?? "" },
    // The header and the first body line are one paragraph in Markdown terms.
    join: [(left: MdNode) => (left.type === "calloutHeader" ? 0 : undefined)],
  });
  return (tree: unknown, file: { value?: unknown }) => {
    const src = String(file.value ?? "");
    eachParent(tree as MdNode, (parent) => {
      parent.children = parent.children.map((child) => (child.type === "blockquote" ? (toCallout(child, src) ?? child) : child));
    });
  };
});

const isBlankBody = (node: Node) =>
  node.childCount === 1 && node.firstChild?.type.name === "paragraph" && node.firstChild.content.size === 0;

export const calloutSchema = $nodeSchema("callout", () => ({
  group: "block",
  content: "block+",
  defining: true,
  attrs: { kind: { default: "note" }, fold: { default: "" }, title: { default: "" } },
  parseDOM: [
    {
      tag: "div[data-callout]",
      getAttrs: (dom) => pastedCallout((dom as HTMLElement).dataset),
    },
  ],
  toDOM: (node) => [
    "div",
    { class: "kasten-callout", "data-callout": node.attrs.kind, "data-fold": node.attrs.fold, "data-title": node.attrs.title },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === "callout",
    runner: (state, node, type) => {
      state.openNode(type, { kind: node.kind, fold: node.fold, title: node.title });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "callout",
    runner: (state, node) => {
      state.openNode("blockquote");
      state.addNode("calloutHeader", undefined, calloutHeader(node.attrs as CalloutAttrs));
      if (!isBlankBody(node)) state.next(node.content);
      state.closeNode();
    },
  },
}));

/** Wraps the current block in a callout of the given kind. */
export const wrapInCalloutCommand = $command(
  "WrapInCallout",
  (ctx) =>
    (kind: string = "note") =>
      wrapIn(calloutSchema.type(ctx), { kind, fold: "", title: "" }),
);
