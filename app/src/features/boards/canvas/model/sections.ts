// What a section holds. JSON Canvas groups keep no list of children, so a
// section holds what sits inside it (`holds` in geometry.ts): dragging a
// section carries those nodes along, and folding it hides them.

import type { BoardNode } from "../../../../lib/vault/types";
import { holds, rectOf, shownRect } from "./geometry";

/** The nodes inside `section`, other sections included. */
export function contents(nodes: readonly BoardNode[], section: BoardNode): BoardNode[] {
  const box = rectOf(section);
  return nodes.filter((n) => n.id !== section.id && holds(box, shownRect(n)));
}

/** Ids of the nodes folded sections hide. */
export function hiddenIds(nodes: readonly BoardNode[]): Set<string> {
  const hidden = new Set<string>();
  for (const section of nodes) {
    if (section.kind !== "group" || !section.collapsed) continue;
    for (const node of contents(nodes, section)) hidden.add(node.id);
  }
  return hidden;
}

/** What dragging `dragged` carries along: the nodes inside dragged
 * sections, and inside those, that are not being dragged themselves. */
export function carried(nodes: readonly BoardNode[], dragged: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  const queue = nodes.filter((n) => n.kind === "group" && dragged.has(n.id));
  for (let i = 0; i < queue.length; i++) {
    for (const node of contents(nodes, queue[i]!)) {
      if (dragged.has(node.id) || out.has(node.id)) continue;
      out.add(node.id);
      if (node.kind === "group") queue.push(node);
    }
  }
  return [...out];
}
