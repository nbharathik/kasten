// Block operations behind the slash menu and the block menu: inserting a
// block, colouring one, duplicating and deleting.

import type { Ctx } from "@milkdown/kit/ctx";
import type { Node } from "@milkdown/kit/prose/model";
import { createTable } from "@milkdown/kit/preset/gfm";
import { NodeSelection, Selection, TextSelection, type Command, type Transaction } from "@milkdown/kit/prose/state";

import { rememberColor, type NotionColor } from "../blocks/color";
import type { BlockKind, InsertKind } from "./catalog";

/** The position just after what the last replace step inserted. */
function insertionEnd(tr: Transaction): number | null {
  const map = tr.mapping.maps[tr.mapping.maps.length - 1];
  let end: number | null = null;
  map?.forEach((_from, _to, _newFrom, newTo) => {
    end ??= newTo;
  });
  return end;
}

/** Inserts a block at the selection. In an empty block it takes that block's place. */
export function insertBlock(kind: InsertKind, ctx: Ctx): Command {
  return (state, dispatch) => {
    const nodes = state.schema.nodes;
    if (kind === "inline-equation") {
      // An empty equation opens its TeX field at once (math-view.ts).
      const math = nodes.math_inline?.create({ value: "" });
      if (!math) return false;
      dispatch?.(state.tr.replaceSelectionWith(math, false).scrollIntoView());
      return true;
    }
    let node: Node | null | undefined;
    if (kind === "divider") node = nodes.hr?.create();
    else if (kind === "image") node = nodes["image-block"]?.create();
    else node = createTable(ctx, 3, 3);
    if (!node) return false;

    const tr = state.tr.replaceSelectionWith(node, false);
    const end = insertionEnd(tr);
    if (end === null) return false;
    if (kind === "divider") {
      // As in Notion, writing continues in a fresh block below the divider.
      const next = tr.doc.nodeAt(end);
      if (!(next && next.type === nodes.paragraph && next.content.size === 0)) tr.insert(end, nodes.paragraph!.create());
      tr.setSelection(TextSelection.create(tr.doc, end + 1));
    } else {
      tr.setSelection(Selection.near(tr.doc.resolve(end - node.nodeSize)));
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** Colours every text in the selected blocks, and what is typed next; `null` clears. */
export function colorBlocks(markName: "text_color" | "bg_color", color: NotionColor | null): Command {
  return (state, dispatch) => {
    const type = state.schema.marks[markName];
    if (!type) return false;
    rememberColor(markName, color);
    const { selection } = state;
    const node = selection instanceof NodeSelection;
    const from = node ? selection.from : selection.$from.start();
    const to = node ? selection.to : selection.$to.end();
    const tr = state.tr.removeMark(from, to, type);
    if (color) tr.addMark(from, to, type.create({ color }));
    if (selection.empty) {
      const marks = (state.storedMarks ?? selection.$from.marks()).filter((m) => m.type !== type);
      tr.setStoredMarks(color ? [...marks, type.create({ color })] : marks);
    }
    dispatch?.(tr);
    return true;
  };
}

/** Inserts a copy of the block at `pos` right after it and puts the caret in the copy. */
export function duplicateBlock(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node) return false;
    const after = pos + node.nodeSize;
    const tr = state.tr.insert(after, node);
    tr.setSelection(Selection.near(tr.doc.resolve(after + 1)));
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** Removes the block at `pos` from the note (undo brings it back). */
export function deleteBlock(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node) return false;
    // Parents left empty go too, as a list without items would.
    const $pos = state.doc.resolve(pos);
    let from = pos;
    let to = pos + node.nodeSize;
    for (let depth = $pos.depth; depth >= 1 && $pos.node(depth).childCount === 1; depth--) {
      from = $pos.before(depth);
      to = $pos.after(depth);
    }
    const tr = state.tr;
    if (from === 0 && to === state.doc.content.size) tr.replaceWith(from, to, state.schema.nodes.paragraph!.create());
    else tr.deleteRange(from, to);
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size))));
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** The "Turn into" kind of a whole block, as the block menu sees it. */
export function kindOfNode(node: Node, parent: Node | null): BlockKind | null {
  switch (node.type.name) {
    case "paragraph":
      return "text";
    case "heading": {
      const level = Number(node.attrs.level);
      return level >= 1 && level <= 3 ? (`h${level}` as BlockKind) : null;
    }
    case "code_block":
      return node.attrs.language === "LaTeX" ? null : "code";
    case "math_block":
      return "math";
    case "list_item":
      if (typeof node.attrs.checked === "boolean") return "todo";
      return parent?.type.name === "ordered_list" ? "numbered" : "bullet";
    case "blockquote":
      return "quote";
    case "callout":
      return "callout";
    case "toggle":
      return "toggle";
    default:
      return null;
  }
}
