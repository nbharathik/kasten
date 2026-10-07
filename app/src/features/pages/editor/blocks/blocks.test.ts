// Callouts, toggles and colours: what Markdown becomes in the editor, and what
// the editor writes back after an edit.

import type { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx, schemaCtx } from "@milkdown/kit/core";
import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createKastenCrepe } from "../crepe";
import { milkdownCodec, topLevel } from "../milkdown-codec";
import { openNote } from "../session";
import { applyColor } from "./color";
import { wrapInCalloutCommand } from "./callout";
import { wrapInToggleCommand } from "./toggle";

let crepe: Crepe;
let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  document.body.append(root);
  crepe = await createKastenCrepe(root);
});

afterAll(async () => {
  await crepe.destroy();
  root.remove();
});

const ctx = () => crepe.editor.ctx;
const view = () => ctx().get(editorViewCtx);
const parse = (md: string) => milkdownCodec(ctx()).parse(md);
const serialize = (nodes: Node[]) => milkdownCodec(ctx()).serialize(nodes).replace(/\n$/, "");

/** Opens `body`, applies `edit` to the view, and returns what would be saved. */
function editAndSave(body: string, edit: () => void): string {
  const note = openNote(crepe, body);
  edit();
  return note.save();
}

/** Sets attributes on the first node of the given type. */
function setAttrs(type: string, attrs: Record<string, unknown>) {
  const { state } = view();
  let pos = -1;
  state.doc.descendants((node, p) => {
    if (pos < 0 && node.type.name === type) pos = p;
    return pos < 0;
  });
  const node = state.doc.nodeAt(pos)!;
  view().dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

describe("callouts", () => {
  it("turn a [!kind] quote into a callout with its body", () => {
    const [callout] = parse("> [!tip] Idea\n> Use image hashes.");
    expect(callout?.type.name).toBe("callout");
    expect(callout?.attrs).toEqual({ kind: "tip", fold: "", title: "Idea" });
    expect(callout?.textContent).toBe("Use image hashes.");
  });

  it("keep the title as raw Markdown and the fold marker", () => {
    const [callout] = parse("> [!info]- **Bold** title\n> body");
    expect(callout?.attrs).toEqual({ kind: "info", fold: "-", title: "**Bold** title" });
    expect(serialize([callout!])).toBe("> [!info]- **Bold** title\n> body");
  });

  it("write a header-only callout back as one line", () => {
    const [callout] = parse("> [!warning]");
    expect(callout?.type.name).toBe("callout");
    expect(serialize([callout!])).toBe("> [!warning]");
  });

  it("leave escaped and ordinary quotes alone", () => {
    expect(parse("> \\[!note] literal")[0]?.type.name).toBe("blockquote");
    expect(parse("> just a quote")[0]?.type.name).toBe("blockquote");
  });

  it("save a title change as the header line only", () => {
    const body = "> [!tip] Idea\n> Use image hashes.\n";
    const saved = editAndSave(body, () => setAttrs("callout", { title: "Better idea", kind: "warning" }));
    expect(saved).toBe("> [!warning] Better idea\n> Use image hashes.\n");
  });

  it("wrap the current block from a command", () => {
    const saved = editAndSave("Remember this\n", () => {
      view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, 1)));
      ctx().get(commandsCtx).call(wrapInCalloutCommand.key, "tip");
    });
    expect(saved).toBe("> [!tip]\n> Remember this\n");
  });
});

describe("toggles", () => {
  const toggle = "<details>\n<summary>Toggle title</summary>\n\nBody with **bold**.\n\n</details>";

  it("turn details into a toggle with its summary and body", () => {
    const [node] = parse(toggle);
    expect(node?.type.name).toBe("toggle");
    expect(node?.attrs).toEqual({ open: false, summary: "Toggle title" });
    expect(node?.textContent).toBe("Body with bold.");
    expect(serialize([node!])).toBe(toggle);
  });

  it("read the one-line form and the open attribute", () => {
    const [node] = parse("<details open><summary>Open</summary>\n\nx\n\n</details>");
    expect(node?.attrs).toEqual({ open: true, summary: "Open" });
  });

  it("nest", () => {
    const [outer] = parse("<details>\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\n\ndeep\n\n</details>\n\n</details>");
    expect(outer?.type.name).toBe("toggle");
    expect(outer?.firstChild?.type.name).toBe("toggle");
    expect(outer?.firstChild?.attrs.summary).toBe("Inner");
  });

  it("leave an unclosed details block as raw HTML", () => {
    expect(topLevel(view().state.doc).length).toBeGreaterThan(0);
    const nodes = parse("<details>\n<summary>Never closed</summary>\n\ntext");
    expect(nodes.some((n) => n.type.name === "toggle")).toBe(false);
  });

  it("count as one block, so editing inside rewrites only the toggle", () => {
    const body = `* star  bullet\n\n${toggle}\n\nAfter   it.\n`;
    const saved = editAndSave(body, () => setAttrs("toggle", { summary: "Renamed" }));
    expect(saved).toBe(`* star  bullet\n\n${toggle.replace("Toggle title", "Renamed")}\n\nAfter   it.\n`);
  });

  it("wrap the current block from a command", () => {
    const saved = editAndSave("Hidden detail\n", () => {
      view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, 1)));
      ctx().get(commandsCtx).call(wrapInToggleCommand.key);
    });
    expect(saved).toBe("<details>\n<summary></summary>\n\nHidden detail\n\n</details>\n");
  });
});

describe("colours", () => {
  const marksOf = (node: Node | undefined) => {
    const found: string[] = [];
    node?.descendants((n) => {
      for (const m of n.marks) found.push(`${m.type.name}:${String(m.attrs.color ?? "")}`);
    });
    return found.sort();
  };

  it("turn Notion-colour spans into marks and write them back", () => {
    const md = 'Plain <span style="color: red">red</span> and <span style="background-color: yellow">**marked**</span>.';
    const [p] = parse(md);
    expect(marksOf(p)).toEqual(["bg_color:yellow", "strong:", "text_color:red"]);
    // Marks nest in schema order, so bold lands outside the span; it renders
    // the same, and untouched blocks keep their original bytes anyway.
    const written = serialize([p!]);
    expect(written).toBe('Plain <span style="color: red">red</span> and **<span style="background-color: yellow">marked</span>**.');
    expect(marksOf(parse(written)[0])).toEqual(marksOf(p));
  });

  it("leave other colours as raw HTML", () => {
    const [p] = parse('<span style="color: crimson">x</span>');
    expect(marksOf(p)).toEqual([]);
  });

  it("colour a selection", () => {
    const saved = editAndSave("Make this blue\n", () => {
      const { state } = view();
      const type = ctx().get(schemaCtx).marks.text_color!;
      view().dispatch(state.tr.setSelection(TextSelection.create(state.doc, 11, 15)));
      view().dispatch(applyColor(view().state, type, "blue"));
    });
    expect(saved).toBe('Make this <span style="color: blue">blue</span>\n');
  });
});
