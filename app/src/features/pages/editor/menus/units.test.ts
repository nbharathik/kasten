import { Schema, type Node } from "@milkdown/kit/prose/model";
import { describe, expect, it } from "vitest";

import { blockNear, blockUnit, dropGap, STEP, type BlockAt } from "./units";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { group: "block", content: "inline*" },
    bullet_list: { group: "block", content: "list_item+" },
    list_item: { content: "paragraph block*" },
    blockquote: { group: "block", content: "block+" },
    code_block: { group: "block", content: "text*" },
    toggle: { group: "block", content: "block+" },
    callout: { group: "block", content: "block+" },
    table: { group: "block", content: "table_row+" },
    table_row: { content: "table_cell+" },
    table_cell: { content: "paragraph+" },
  },
});
const n = schema.nodes;
const p = (text: string) => n.paragraph!.create(null, schema.text(text));

const doc = n.doc!.create(null, [
  p("Intro"),
  n.bullet_list!.create(null, [n.list_item!.create(null, [p("One"), n.bullet_list!.create(null, [n.list_item!.create(null, [p("One.a")])])]), n.list_item!.create(null, [p("Two")])]),
  n.toggle!.create(null, [p("Inside a toggle"), p("Also inside")]),
  n.blockquote!.create(null, [p("Quoted")]),
  n.table!.create(null, [n.table_row!.create(null, [n.table_cell!.create(null, [p("Cell")])])]),
  n.callout!.create(null, [p("Callout text")]),
]);

/** The position of the paragraph holding `text`. */
function inside(text: string): number {
  let found = -1;
  doc.descendants((node: Node, pos: number) => {
    if (found < 0 && node.type.name === "paragraph" && node.textContent === text) found = pos;
    return found < 0;
  });
  return found;
}
const unitOf = (text: string) => {
  const unit = blockUnit(doc, inside(text))!;
  return `${unit.node.type.name}:${unit.node.textContent}`;
};

describe("the block handle's block", () => {
  it("is each list item, nested ones included", () => {
    expect(unitOf("One")).toBe("list_item:OneOne.a");
    expect(unitOf("One.a")).toBe("list_item:One.a");
    expect(unitOf("Two")).toBe("list_item:Two");
  });

  it("is each block inside a toggle or callout, and top-level blocks", () => {
    expect(unitOf("Inside a toggle")).toBe("paragraph:Inside a toggle");
    expect(unitOf("Callout text")).toBe("paragraph:Callout text");
    expect(unitOf("Intro")).toBe("paragraph:Intro");
  });

  it("keeps tables and quotes whole", () => {
    expect(unitOf("Cell")).toBe("table:Cell");
    expect(unitOf("Quoted")).toBe("blockquote:Quoted");
  });

  it("finds a block from between blocks, too", () => {
    const toggleAt = inside("Inside a toggle") - 1;
    expect(blockNear(doc, { pos: toggleAt, inside: -1 })!.node.type.name).toBe("toggle");
    expect(blockNear(doc, { pos: doc.content.size, inside: -1 })!.node.type.name).toBe("callout");
    // Between two blocks inside a toggle is beside them, not on the toggle.
    expect(blockNear(doc, { pos: inside("Also inside"), inside: -1 })!.node.textContent).toBe("Also inside");
    expect(blockNear(doc, { pos: inside("Also inside") + "Also inside".length + 2, inside: -1 })!.node.textContent).toBe("Also inside");
    // Inside a line's text is that line's block.
    expect(blockNear(doc, { pos: inside("Two") + 2, inside: -1 })!.node.type.name).toBe("list_item");
  });
});

describe("where a dragged block lands", () => {
  const unit = (text: string) => blockUnit(doc, inside(text))!;
  const name = (at: BlockAt) => `${at.node.type.name}:${at.node.textContent}`;
  /** A block held level with every level, or far to their left. */
  const level = () => 0;
  const left = () => STEP + 10;

  it("is beside the block under the pointer, inside lists and toggles alike", () => {
    // Between two items is in the list, wherever the block is held.
    expect(dropGap(doc, unit("Two"), false, left)).toMatchObject({ pos: unit("Two").pos, after: false });
    expect(dropGap(doc, unit("One.a"), false, left)).toMatchObject({ pos: unit("One.a").pos, after: false });
    expect(dropGap(doc, unit("Also inside"), false, left).pos).toBe(unit("Also inside").pos);
    expect(dropGap(doc, unit("Inside a toggle"), false, left).pos).toBe(unit("Inside a toggle").pos);
  });

  it("stays at the end of a list, toggle or callout while the block is level with its insides", () => {
    const two = unit("Two");
    expect(dropGap(doc, two, true, level)).toMatchObject({ pos: two.pos + two.node.nodeSize, after: true });
    expect(name(dropGap(doc, unit("Also inside"), true, level).at)).toBe("paragraph:Also inside");
    expect(name(dropGap(doc, unit("Callout text"), true, level).at)).toBe("paragraph:Callout text");
  });

  it("goes out of them, one level at a time, while the block is held left of their insides", () => {
    // After the last item of a nested list: after its item, then after the whole list.
    const once = (at: BlockAt) => (at.node.type.name === "list_item" && at.node.textContent === "One.a" ? STEP + 1 : 0);
    expect(name(dropGap(doc, unit("One.a"), true, once).at)).toBe("list_item:OneOne.a");
    expect(name(dropGap(doc, unit("Two"), true, left).at)).toBe("bullet_list:OneOne.aTwo");
    expect(name(dropGap(doc, unit("Also inside"), true, left).at)).toBe("toggle:Inside a toggleAlso inside");
    // Above a list's first item is above the list; above a toggle's first block is not above the toggle.
    expect(name(dropGap(doc, unit("One"), false, left).at)).toBe("bullet_list:OneOne.aTwo");
    expect(name(dropGap(doc, unit("Inside a toggle"), false, left).at)).toBe("paragraph:Inside a toggle");
    // Above a nested list's first item stays in its item: its parent item's text is in between.
    expect(name(dropGap(doc, unit("One.a"), false, left).at)).toBe("list_item:One.a");
  });

  it("keeps a top-level block where it is, left or not", () => {
    const intro = unit("Intro");
    expect(dropGap(doc, intro, false, left)).toMatchObject({ pos: intro.pos, at: intro });
    const callout = blockNear(doc, { pos: doc.content.size, inside: -1 })!;
    expect(dropGap(doc, callout, true, left).pos).toBe(doc.content.size);
  });
});

