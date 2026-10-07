// "Template…" in the slash menu: offered while the page is empty, picking
// it clears the "/" and hands over to the page, which opens the gallery.

import { afterEach, describe, expect, it } from "vitest";

import { useTestEditor } from "../../../../test/editor";

let picked = 0;
const editor = useTestEditor({ onTemplate: () => picked++ });
const menu = () => document.querySelector<HTMLElement>(".kasten-menu");
const labels = () => [...(menu()?.querySelectorAll(".kasten-menu-label") ?? [])].map((label) => label.textContent);

afterEach(() => {
  editor.press("Escape");
  picked = 0;
});

describe("Template… in the slash menu", () => {
  it("is offered on an empty page, and picking it clears the slash", () => {
    editor.open("");
    editor.type("/");
    expect(labels()).toContain("Template…");
    editor.type("templ").press("Enter");
    expect(picked).toBe(1);
    expect(menu()).toBeNull();
    expect(editor.doc.textContent).toBe("");
  });

  it("is not offered once the page has text", () => {
    editor.open("Hello\n").caret("Hello", true);
    editor.type(" /");
    expect(menu()).not.toBeNull();
    expect(labels()).not.toContain("Template…");
    expect(labels()).toContain("Ask AI…");
  });
});
