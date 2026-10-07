// Moving a block, as a drag by its handle does: whole, and fitted to where
// it lands (move-block.ts).

import { Schema, type Node } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { blockUnit, type BlockAt } from "./units";
import { moveBlockTo } from "./move-block";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*" },
    bullet_list: { group: "block", content: "list_item+" },
    ordered_list: { group: "block", content: "list_item+" },
    list_item: { content: "paragraph block*", attrs: { listType: { default: "bullet" }, label: { default: "•" } } },
    toggle: { group: "block", content: "block+", attrs: { summary: { default: "" } } },
    callout: { group: "block", content: "block+" },
  },
});
const n = schema.nodes;
const p = (text = "") => n.paragraph!.create(null, text ? schema.text(text) : null);
const li = (text: string, ...more: Node[]) => n.list_item!.create(null, [p(text), ...more]);
const numbered = (text: string, label: string) => n.list_item!.create({ listType: "ordered", label }, p(text));

const page = () =>
  n.doc!.create(null, [
    p("Intro"),
    n.bullet_list!.create(null, [li("One", n.bullet_list!.create(null, [li("One.a")])), li("Two")]),
    n.toggle!.create({ summary: "Details" }, [p("Inside"), p("Also inside")]),
    p("End"),
  ]);

/** The doc as a line of its blocks, for comparing. */
function shape(node: Node): string {
  if (node.isText) return node.text ?? "";
  if (node.type.name === "paragraph") return node.textContent;
  const inner: string[] = [];
  node.forEach((child) => inner.push(shape(child)));
  const name = node.type.name === "toggle" ? `toggle(${String(node.attrs.summary)})` : node.type.name;
  return node.type.name === "doc" ? inner.join(" | ") : `${name}[${inner.join(", ")}]`;
}

/** The handle's block around the paragraph holding `text`. */
function unit(doc: Node, text: string): BlockAt {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === "paragraph" && node.textContent === text) found = pos;
    return found < 0;
  });
  return blockUnit(doc, found)!;
}

/** The unit that holds `text`, whatever it is (a list item, a toggle). */
function holder(doc: Node, name: string, text: string): BlockAt {
  let found: BlockAt | null = null;
  doc.descendants((node, pos) => {
    if (!found && node.type.name === name && node.textContent.startsWith(text)) found = { pos, node };
    return !found;
  });
  return found!;
}

const before = (at: BlockAt) => at.pos;
const after = (at: BlockAt) => at.pos + at.node.nodeSize;

function move(doc: Node, from: BlockAt, target: number) {
  const state = EditorState.create({ schema, doc });
  const tr = moveBlockTo(state, from, target);
  return tr && { doc: tr.doc, selection: tr.selection };
}

describe("moving a block", () => {
  it("moves a paragraph, and a toggle with its title and insides, whole", () => {
    const doc = page();
    expect(shape(move(doc, unit(doc, "Intro"), after(unit(doc, "End")))!.doc)).toBe(
      "bullet_list[list_item[One, bullet_list[list_item[One.a]]], list_item[Two]] | toggle(Details)[Inside, Also inside] | End | Intro",
    );
    const toggle = holder(doc, "toggle", "Inside");
    const moved = move(doc, toggle, before(unit(doc, "Intro")))!;
    expect(shape(moved.doc)).toBe("toggle(Details)[Inside, Also inside] | Intro | bullet_list[list_item[One, bullet_list[list_item[One.a]]], list_item[Two]] | End");
    // The moved block is what is selected.
    expect(moved.selection).toBeInstanceOf(NodeSelection);
    expect((moved.selection as NodeSelection).node.type.name).toBe("toggle");
  });

  it("reorders list items, and a list item dropped outside its list is a list of its own", () => {
    const doc = page();
    expect(shape(move(doc, unit(doc, "Two"), before(unit(doc, "One")))!.doc)).toBe(
      "Intro | bullet_list[list_item[Two], list_item[One, bullet_list[list_item[One.a]]]] | toggle(Details)[Inside, Also inside] | End",
    );
    expect(shape(move(doc, unit(doc, "Two"), after(unit(doc, "End")))!.doc)).toBe(
      "Intro | bullet_list[list_item[One, bullet_list[list_item[One.a]]]] | toggle(Details)[Inside, Also inside] | End | bullet_list[list_item[Two]]",
    );
    // The last item of a nested list takes its list with it.
    expect(shape(move(doc, unit(doc, "One.a"), before(unit(doc, "Intro")))!.doc)).toBe(
      "bullet_list[list_item[One.a]] | Intro | bullet_list[list_item[One], list_item[Two]] | toggle(Details)[Inside, Also inside] | End",
    );
  });

  it("makes a paragraph dropped between list items an item", () => {
    const doc = page();
    expect(shape(move(doc, unit(doc, "End"), before(unit(doc, "Two")))!.doc)).toBe(
      "Intro | bullet_list[list_item[One, bullet_list[list_item[One.a]]], list_item[End], list_item[Two]] | toggle(Details)[Inside, Also inside]",
    );
  });

  it("moves blocks in and out of a toggle, which keeps a line when emptied", () => {
    let doc = page();
    doc = move(doc, unit(doc, "End"), after(unit(doc, "Also inside")))!.doc;
    expect(shape(doc)).toBe("Intro | bullet_list[list_item[One, bullet_list[list_item[One.a]]], list_item[Two]] | toggle(Details)[Inside, Also inside, End]");
    doc = move(doc, unit(doc, "Also inside"), before(unit(doc, "Intro")))!.doc;
    doc = move(doc, unit(doc, "End"), before(unit(doc, "Intro")))!.doc;
    doc = move(doc, unit(doc, "Inside"), before(unit(doc, "Intro")))!.doc;
    expect(shape(doc)).toBe("Also inside | End | Inside | Intro | bullet_list[list_item[One, bullet_list[list_item[One.a]]], list_item[Two]] | toggle(Details)[]");
    const toggle = holder(doc, "toggle", "");
    expect(toggle.node.childCount).toBe(1);
    expect(toggle.node.firstChild!.type.name).toBe("paragraph");
  });

  it("does nothing when a block is dropped on itself or into itself", () => {
    const doc = page();
    const toggle = holder(doc, "toggle", "Inside");
    expect(move(doc, toggle, after(unit(doc, "Inside")))).toBeNull();
    expect(move(doc, unit(doc, "Intro"), before(unit(doc, "Intro")))).toBeNull();
    expect(move(doc, unit(doc, "Intro"), after(unit(doc, "Intro")))).toBeNull();
  });

  it("splits a list where a heading lands in its middle, and puts it beside the list at its ends", () => {
    const doc = n.doc!.create(null, [n.heading!.create(null, schema.text("Title")), n.bullet_list!.create(null, [li("One"), li("Two")])]);
    const title = holder(doc, "heading", "Title");
    const middle = move(doc, title, before(unit(doc, "Two")))!;
    expect(shape(middle.doc)).toBe("bullet_list[list_item[One]] | heading[Title] | bullet_list[list_item[Two]]");
    expect((middle.selection as NodeSelection).node.type.name).toBe("heading");
    expect(shape(move(doc, title, after(unit(doc, "Two")))!.doc)).toBe("bullet_list[list_item[One], list_item[Two]] | heading[Title]");
  });

  it("gives an item the marker of the list it joins, and a list of its own kind outside one", () => {
    const doc = n.doc!.create(null, [n.ordered_list!.create(null, [numbered("First", "1."), numbered("Second", "2.")]), n.bullet_list!.create(null, [li("Dot")])]);
    const joined = move(doc, unit(doc, "Second"), before(unit(doc, "Dot")))!;
    expect(shape(joined.doc)).toBe("ordered_list[list_item[First]] | bullet_list[list_item[Second], list_item[Dot]]");
    expect(unit(joined.doc, "Second").node.attrs).toMatchObject({ listType: "bullet", label: "•" });
    const alone = move(doc, unit(doc, "First"), after(holder(doc, "bullet_list", "Dot")))!;
    expect(shape(alone.doc)).toBe("ordered_list[list_item[Second]] | bullet_list[list_item[Dot]] | ordered_list[list_item[First]]");
    expect((alone.selection as NodeSelection).node.type.name).toBe("list_item");
  });
});
