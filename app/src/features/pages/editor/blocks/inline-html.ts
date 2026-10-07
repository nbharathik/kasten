// Inline HTML pairs such as `<span style="color: red">…</span>` or `<u>…</u>`
// arrive from remark as separate `html` siblings around the text. These
// helpers pair them up into one mdast node, and write such a node back.

import type { MdNode } from "./mdast";

export interface HtmlPair<T> {
  /** Recognises an opening tag and returns what the node needs from it. */
  open(html: string): T | null;
  /** Any opening tag of the same element, for nesting depth. */
  nests(html: string): boolean;
  close(html: string): boolean;
  build(info: T, children: MdNode[]): MdNode;
}

const htmlOf = (node: MdNode | undefined) => (node?.type === "html" ? (node.value ?? "").trim() : null);

/** Wraps each opening tag, its matching closing tag and what lies between into one node. */
export function groupHtmlPairs<T>(children: MdNode[], pair: HtmlPair<T>): MdNode[] {
  const out: MdNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const info = pair.open(htmlOf(children[i]) ?? "");
    let end = -1;
    for (let j = i + 1, depth = 0; info !== null && j < children.length && end < 0; j++) {
      const value = htmlOf(children[j]);
      if (value === null) continue;
      if (pair.nests(value)) depth++;
      else if (pair.close(value)) {
        if (depth === 0) end = j;
        else depth--;
      }
    }
    if (end < 0) {
      out.push(children[i]!);
      continue;
    }
    out.push(pair.build(info!, children.slice(i + 1, end)));
    i = end;
  }
  return out;
}

interface Tracker {
  move(value: string): string;
  current(): Record<string, unknown>;
}
interface PhrasingState {
  createTracker(info: unknown): Tracker;
  enter(name: string): () => void;
  containerPhrasing(node: MdNode, info: Record<string, unknown>): string;
}

/** An mdast-util-to-markdown handler that writes a node's children between two tags. */
export function htmlPairHandler(openTag: (node: MdNode) => string, closeTag: string) {
  function handler(node: MdNode, _parent: unknown, state: PhrasingState, info: unknown): string {
    const tracker = state.createTracker(info);
    const exit = state.enter("phrasing");
    let value = tracker.move(openTag(node));
    value += tracker.move(state.containerPhrasing(node, { before: value, after: "<", ...tracker.current() }));
    value += tracker.move(closeTag);
    exit();
    return value;
  }
  handler.peek = () => "<";
  return handler;
}
