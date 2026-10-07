// Small helpers for the remark transformers behind Kasten's Notion-style blocks.

export interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  [key: string]: unknown;
}

export type MdParent = MdNode & { children: MdNode[] };

/** Calls `fn` on every node that has children, a parent before its children,
 * so `fn` may replace `parent.children` and the new children are visited. */
export function eachParent(node: MdNode, fn: (parent: MdParent) => void): void {
  if (!node.children) return;
  fn(node as MdParent);
  for (const child of node.children) eachParent(child, fn);
}

/** Whether any text inside `node` spans a line break. */
export function containsLineBreak(node: MdNode): boolean {
  if (node.type === "break") return true;
  if (typeof node.value === "string" && node.value.includes("\n")) return true;
  return (node.children ?? []).some(containsLineBreak);
}

/** The value of a raw HTML block, whether remark left it bare or Milkdown
 * wrapped it in a paragraph. */
export function htmlBlockValue(node: MdNode): string | null {
  if (node.type === "html") return node.value ?? "";
  const only = node.type === "paragraph" && node.children?.length === 1 ? node.children[0] : undefined;
  return only?.type === "html" ? (only.value ?? "") : null;
}
