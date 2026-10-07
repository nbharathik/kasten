// "Mind map from this page": a new board with the page's card at the root
// and its outline (headings and list items, nested as written) as sticky
// branches, laid out by the Mind map layout. Made through the core's board
// changes like any board, so it is an ordinary board to edit, and the page
// is left as it was.

import { splitFrontmatter } from "../pages/markdown/frontmatter";
import type { BoardChange, NoteMeta, VaultClient } from "../../lib/vault/types";
import { mindMap } from "./canvas/model/mind-map";

export interface OutlineNode {
  text: string;
  children: OutlineNode[];
}

/** Most branches a map starts with; bigger pages keep their first ones. */
const MAX_NODES = 80;
/** A branch's width, and its height for one line and each line more. */
const WIDTH = 240;
const LINE = 22;
const CHARS_PER_LINE = 26;

/** Inline Markdown as plain words. */
function plain(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?!\w)/g, "$1$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The page's headings and list items as a tree, at most `limit` of them. */
export function outlineTree(markdown: string, limit = MAX_NODES): OutlineNode[] {
  const top: OutlineNode[] = [];
  // Open headings by level, and open list items by indent under the last heading.
  const headings: { level: number; node: OutlineNode }[] = [];
  let items: { indent: number; node: OutlineNode }[] = [];
  let count = 0;
  let fence = false;
  const under = (node: OutlineNode, parent: OutlineNode | undefined) => (parent ? parent.children : top).push(node);
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence || count >= limit) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const node: OutlineNode = { text: plain(heading[2]!), children: [] };
      while (headings.length && headings[headings.length - 1]!.level >= level) headings.pop();
      under(node, headings[headings.length - 1]?.node);
      headings.push({ level, node });
      items = [];
      count++;
      continue;
    }
    const item = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.+)$/.exec(line);
    if (item) {
      const indent = item[1]!.replace(/\t/g, "    ").length;
      const box = item[2] === undefined ? "" : item[2] === " " ? "☐ " : "☑ ";
      const node: OutlineNode = { text: box + plain(item[3]!), children: [] };
      while (items.length && items[items.length - 1]!.indent >= indent) items.pop();
      under(node, items[items.length - 1]?.node ?? headings[headings.length - 1]?.node);
      items.push({ indent, node });
      count++;
    }
  }
  return top;
}

/** Makes the page's mind map as a new board beside it; its path. */
export async function mapFromPage(client: VaultClient, note: NoteMeta): Promise<string> {
  const { body } = splitFrontmatter((await client.read(note.path)).text);
  const tree = outlineTree(body);
  if (tree.length === 0) throw new Error(`“${note.title}” has no headings or lists to map`);
  const path = await client.createBoard(`${note.title} map`, note.project);

  // First the root card and a sticky per branch, in reading order.
  const order: { node: OutlineNode; parent: number }[] = [];
  const walk = (nodes: OutlineNode[], parent: number) => {
    for (const node of nodes) {
      order.push({ node, parent });
      walk(node.children, order.length);
    }
  };
  walk(tree, 0);
  const made = await client.boardApply(path, [
    { kind: "card", path: note.path, x: 0, y: 0 },
    ...order.map(({ node }): BoardChange => ({ kind: "sticky", text: node.text, x: 0, y: 0 })),
  ]);
  const ids = made.made;

  // Then each branch joined to its parent, at a size for its words.
  const joined = await client.boardApply(path, [
    ...order.flatMap(({ node }, i): BoardChange[] => {
      const lines = Math.min(5, Math.max(1, Math.ceil(node.text.length / CHARS_PER_LINE)));
      return [{ kind: "place", id: ids[i + 1]!, x: 0, y: 0, width: WIDTH, height: 40 + LINE * lines }];
    }),
    ...order.map(({ parent }, i): BoardChange => ({ kind: "connect", from: ids[parent]!, to: ids[i + 1]!, fromSide: "right", toSide: "left" })),
  ]);

  // Then laid out as a tree from the page.
  const { nodes, edges } = joined.board;
  const root = nodes.filter((n) => n.id === ids[0]);
  const layout = mindMap(nodes, edges, root);
  if (layout.length) await client.boardApply(path, layout);
  return path;
}
