// Enter and Backspace in a toggle's body never take the toggle or its title
// away, as ProseMirror's own lift would.

import { TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { useTestEditor } from "../../../../test/editor";

const editor = useTestEditor();

const BLANK = "<details>\n<summary>A toggle</summary>\n\n</details>\n";

const toggles = () => editor.types().filter((t) => t === "toggle").length;

/** Puts the caret in the toggle's first body line. */
function intoBody() {
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
  return editor;
}

describe("keys in a toggle's body", () => {
  it("Enter on the blank body of a new toggle keeps it, title and all, and goes below it", () => {
    editor.open(BLANK);
    intoBody().press("Enter");
    expect(editor.types()).toEqual(["toggle", "paragraph"]);
    expect(editor.doc.firstChild?.attrs.summary).toBe("A toggle");
    editor.type("After");
    expect(editor.save()).toBe(`${BLANK}\nAfter\n`);
  });

  it("Enter on an empty last line leaves the toggle, keeping the lines above", () => {
    const text = "<details open>\n<summary>Plan</summary>\n\nOne\n\n</details>\n";
    editor.open(text).caret("One", true).press("Enter").press("Enter").type("After");
    expect(editor.save()).toBe(`${text}\nAfter\n`);
  });

  it("Enter on an empty line between others adds a line, and the toggle stays whole", () => {
    editor.open("<details open>\n<summary>Plan</summary>\n\nOne\n\nTwo\n\n</details>\n");
    editor.caret("One", true).press("Enter").press("Enter");
    expect(toggles()).toBe(1);
    expect(editor.doc.firstChild?.childCount).toBe(4);
    expect(editor.doc.firstChild?.attrs.summary).toBe("Plan");
  });

  it("Backspace at the start of the body goes to the title and deletes nothing", () => {
    editor.open(BLANK);
    intoBody().press("Backspace");
    expect(editor.save()).toBe(BLANK);
    const title = document.activeElement as HTMLInputElement;
    expect(title.classList.contains("kasten-toggle-summary")).toBe(true);
    expect(title.selectionStart).toBe("A toggle".length);
  });

  it("leaves Enter and Backspace alone elsewhere", () => {
    editor.open("<details open>\n<summary>Plan</summary>\n\n- item\n\n</details>\n");
    // An empty item leaves its list, not the toggle.
    editor.caret("item", true).press("Enter").press("Enter");
    expect(toggles()).toBe(1);
    expect(editor.doc.firstChild?.childCount).toBe(2);
  });
});
