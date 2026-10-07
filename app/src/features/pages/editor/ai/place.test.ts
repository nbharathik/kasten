// What AI is sent from a page, and where a taken answer goes: in place of
// the selection, joined to the text around it, or below its block, or
// filling the empty line at the caret. Each is one change one undo takes
// back, and blocks around it keep their bytes.

import { parserCtx, serializerCtx } from "@milkdown/kit/core";
import { undo } from "@milkdown/kit/prose/history";
import { TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { findText, useTestEditor } from "../../../../test/editor";
import { AROUND, cleanAnswer, pageText, placeAnswer } from "./place";

const editor = useTestEditor();

const BODY = "# Trip\n\nPack the **tent**. Check the poles.\n\nThe tent goes last.\n";

const serialize = () => editor.ctx.get(serializerCtx);
const parse = (markdown: string) => editor.ctx.get(parserCtx)(markdown);

function select(text: string) {
  const from = findText(editor.doc, text);
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
  return { from, to: from + text.length };
}

function place(markdown: string, range: { from: number; to: number }, how: "replace" | "below") {
  editor.view.dispatch(placeAnswer(editor.view.state, parse(markdown).content, range, how));
}

describe("what AI is sent", () => {
  it("sends the selection as Markdown, and plain text around it", () => {
    editor.open(BODY);
    // "Pack the **tent**." runs over a bold mark: selected from end to end.
    const range = { from: findText(editor.doc, "Pack the "), to: findText(editor.doc, ". Check") + 1 };
    const sent = pageText(editor.doc, "ask", range, serialize());
    expect(sent.selection).toBe("Pack the **tent**.");
    expect(sent.before).toBe("Trip\n\n");
    expect(sent.after).toBe(" Check the poles.\n\nThe tent goes last.");
    // At the caret there is no selection to send.
    expect(pageText(editor.doc, "ask", { from: range.to, to: range.to }, serialize()).selection).toBe("");
  });

  it("sends the whole page to summarize, without the editor's blank lines", () => {
    editor.open(BODY);
    const { view } = editor;
    const end = view.state.doc.content.size;
    view.dispatch(view.state.tr.insert(end, view.state.schema.nodes.paragraph!.create()).insert(end, view.state.schema.nodes.paragraph!.create()));
    const sent = pageText(editor.doc, "summarize", { from: end, to: end }, serialize());
    expect(sent.selection).toBe("# Trip\n\nPack the **tent**. Check the poles.\n\nThe tent goes last.");
  });

  it("sends only so much of the page around it", () => {
    editor.open(`${"a".repeat(AROUND * 2)} middle ${"b".repeat(AROUND * 2)}\n`);
    const range = select("middle");
    const sent = pageText(editor.doc, "ask", range, serialize());
    expect(sent.before).toHaveLength(AROUND);
    expect(sent.after).toHaveLength(AROUND);
  });

  it("takes off a code fence around the whole answer only", () => {
    expect(cleanAnswer("```markdown\n- one\n- two\n```\n")).toBe("- one\n- two");
    expect(cleanAnswer("```\nPlain.\n```")).toBe("Plain.");
    expect(cleanAnswer("Run this:\n\n```sh\nls\n```")).toBe("Run this:\n\n```sh\nls\n```");
  });
});

describe("where a taken answer goes", () => {
  it("replaces the selection, a sentence joining the text around it", () => {
    editor.open(BODY);
    place("Take the **big** tent.", select("Check the poles."), "replace");
    expect(editor.save()).toBe("# Trip\n\nPack the **tent**. Take the **big** tent.\n\nThe tent goes last.\n");
    undo(editor.view.state, editor.view.dispatch);
    expect(editor.save()).toBe(BODY);
  });

  it("replaces the selection with blocks, which stand on their own", () => {
    editor.open(BODY);
    place("- Tent\n- Poles", select("The tent goes last."), "replace");
    expect(editor.save()).toContain("Check the poles.\n\n- Tent\n- Poles\n");
    undo(editor.view.state, editor.view.dispatch);
    expect(editor.save()).toBe(BODY);
  });

  it("inserts below the block, or fills the empty line at the caret", () => {
    editor.open(BODY);
    const range = select("Check the poles.");
    place("- Tent\n- Poles", range, "below");
    expect(editor.save()).toBe("# Trip\n\nPack the **tent**. Check the poles.\n\n- Tent\n- Poles\n\nThe tent goes last.\n");
    undo(editor.view.state, editor.view.dispatch);
    expect(editor.save()).toBe(BODY);

    const { view } = editor;
    const end = view.state.doc.content.size;
    view.dispatch(view.state.tr.insert(end, view.state.schema.nodes.paragraph!.create()));
    const caret = view.state.doc.content.size - 1;
    place("Bring a lamp.", { from: caret, to: caret }, "below");
    expect(editor.save()).toBe(`${BODY}\nBring a lamp.\n`);
  });
});
