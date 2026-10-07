// Every fixture opens and saves through the real page editor without a single
// changed byte. Edits are checked too: typing into any block leaves the rest of
// the note alone, and the saved text reopens exactly as the editor showed it.

import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Node } from "@milkdown/kit/prose/model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { markdownFixtures } from "../../../test/fixtures";
import { SAMPLE_PAGE } from "../sample-page";
import { splitFrontmatter } from "../markdown/frontmatter";
import { loadMarkdown } from "../markdown/lossless";
import { createKastenCrepe } from "./crepe";
import { milkdownCodec, topLevel } from "./milkdown-codec";
import { openNote } from "./session";

const fixtures = markdownFixtures();

/** Known editor limitations, each with the reason it cannot pass yet. */
const KNOWN_RELOAD_ISSUES = new Map([
  [
    "roundtrip/05-tasks.md#* [ ] star task",
    "Milkdown writes a task item whose text starts with a space as `-  [ ] text`, which reopens as plain text",
  ],
]);

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

const view = () => crepe.editor.ctx.get(editorViewCtx);
const visible = (doc: Node) => topLevel(doc).filter((n) => !(n.type.name === "paragraph" && n.childCount === 0));

/** Types at the start of the first textblock in top-level node `index` that
 * holds text or is empty (raw HTML blocks are atoms). */
function typeInto(index: number, text: string): boolean {
  const { state } = view();
  const block = state.doc.maybeChild(index);
  if (!block) return false;
  let offset = 0;
  for (let i = 0; i < index; i++) offset += state.doc.child(i).nodeSize;
  let target: { pos: number; empty: boolean } | null = null;
  const typeable = (n: Node) => n.isTextblock && (n.childCount === 0 || n.content.content.some((c) => c.isText));
  if (typeable(block)) target = { pos: offset + 1, empty: block.childCount === 0 };
  block.descendants((child, pos) => {
    if (target) return false;
    if (typeable(child)) target = { pos: offset + 1 + pos + 1, empty: child.childCount === 0 };
    return !target;
  });
  if (!target) return false;
  const { pos, empty } = target as { pos: number; empty: boolean };
  view().dispatch(state.tr.insertText(empty ? text.trimEnd() : text, pos));
  return true;
}

describe("page editor round trip", () => {
  it("leaves blocks that did not fuse with an edit alone", () => {
    // Found in Chromium: re-writing the task list must not drag the callout
    // near it along, which would escape its `[!warning]`.
    const { body } = splitFrontmatter(SAMPLE_PAGE);
    const note = openNote(crepe, body);
    const index = topLevel(view().state.doc).findIndex((n) => n.textContent.startsWith("Edit this task"));
    expect(typeInto(index, "Edited ")).toBe(true);
    const saved = note.save();
    expect(saved).toContain("> [!warning] Callouts have kinds\n> Click the icon");
    expect(saved).toContain("Getting around\n==============\n\n* Links to notes");
    expect(saved).toContain("- [ ] Edited Edit this task");
    expect(saved.replace("Edited ", "")).toBe(body);
  });

  it("finds the fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
  });

  it.each(fixtures.map((f) => [f.name, f.text]))("opens and saves %s without changing a byte", (_name, text) => {
    const { prefix, body } = splitFrontmatter(text);
    const note = openNote(crepe, body);
    expect(prefix + note.save()).toBe(text);
  });

  it.each(fixtures.map((f) => [f.name, f.text]))("keeps edits to %s local and reopens them faithfully", (name, text) => {
    const { body } = splitFrontmatter(text);
    const codec = milkdownCodec(crepe.editor.ctx);
    const { units } = loadMarkdown(codec, body).snapshot;
    let nodeIndex = 0;
    let offset = 0;
    const starts = units.map((u) => {
      offset += u.gap.length;
      const start = offset;
      offset += u.src.length;
      return start;
    });

    units.forEach((u, ui) => {
      const index = nodeIndex;
      nodeIndex += u.nodes.length;
      if (u.nodes.length === 0) return;
      const note = openNote(crepe, body);
      if (!typeInto(index, "Edited ")) return;
      const held = visible(view().state.doc);
      const saved = note.save();

      // Only this block, and at most one neighbour that had to be re-written
      // with it (two lists with the same marker would fuse), may change.
      const before = ui > 0 ? starts[ui - 1]! : starts[ui]!;
      const next = units[ui + 1];
      const after = next ? (units[ui + 2] ? starts[ui + 2]! - units[ui + 2]!.gap.length : body.length) : body.length;
      expect(saved.startsWith(body.slice(0, before)), `${name} block ${ui}: text before it changed`).toBe(true);
      expect(saved.endsWith(body.slice(after)), `${name} block ${ui}: text after it changed`).toBe(true);
      expect(saved).toContain("Edited");

      const key = `${name}#${u.src.split(/\r?\n/)[0]}`;
      if (KNOWN_RELOAD_ISSUES.has(key)) return;
      openNote(crepe, saved);
      const reopened = visible(view().state.doc);
      const same = reopened.length === held.length && reopened.every((n, i) => n.eq(held[i]!));
      expect(same, `${name} block ${ui} reopens differently:\n${saved}`).toBe(true);
    });
  });
});
