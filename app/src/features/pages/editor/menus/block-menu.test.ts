import { describe, expect, it } from "vitest";

import { useTestEditor } from "../../../../test/editor";
import type { MenuItem } from "../ui/popover";
import { blockMenuSections } from "./block-menu";

const editor = useTestEditor();

function items(pos: number): MenuItem[] {
  return blockMenuSections(editor.view, pos).flatMap((s) => s.items);
}
const item = (pos: number, key: string) => items(pos).find((i) => i.key === key)!;

describe("the block menu", () => {
  it("offers Notion's actions for a text block", () => {
    editor.open("Hello\n");
    expect(items(0).map((i) => i.label)).toEqual(["Turn into", "Colour", "Duplicate", "Delete"]);
  });

  it("marks the block's current kind under Turn into", () => {
    editor.open("## Two\n");
    const turn = item(0, "turn-into").submenu!().flatMap((s) => s.items);
    expect(turn.filter((i) => i.active).map((i) => i.key)).toEqual(["h2"]);
    turn.find((i) => i.key === "quote")!.onPick!();
    expect(editor.save()).toBe("> Two\n");
  });

  it("turns a block into an equation and back", () => {
    editor.open("x^2\n");
    item(0, "turn-into").submenu!().flatMap((s) => s.items).find((i) => i.key === "math")!.onPick!();
    expect(editor.save()).toBe("$$\nx^2\n$$\n");
    const turn = item(0, "turn-into").submenu!().flatMap((s) => s.items);
    expect(turn.filter((i) => i.active).map((i) => i.key)).toEqual(["math"]);
    turn.find((i) => i.key === "text")!.onPick!();
    expect(editor.save()).toBe("x^2\n");
  });

  it("colours, duplicates and deletes the block", () => {
    editor.open("One\n\nTwo\n");
    const colour = item(0, "color").submenu!().flatMap((s) => s.items);
    colour.find((i) => i.key === "bg_color-blue")!.onPick!();
    expect(editor.save()).toBe('<span style="background-color: blue">One</span>\n\nTwo\n');
    item(0, "duplicate").onPick!();
    item(0, "delete").onPick!();
    expect(editor.save()).toBe('<span style="background-color: blue">One</span>\n\nTwo\n');
  });

  it("has no Turn into or Colour for a divider", () => {
    editor.open("---\n");
    expect(items(0).map((i) => i.key)).toEqual(["duplicate", "delete"]);
  });
});
