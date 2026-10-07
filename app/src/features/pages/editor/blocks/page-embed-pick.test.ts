// The slash menu's "Embed a page" picks a page and puts `![[Title]]` on a
// line of its own, which shows that page's text in place.

import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createKastenCrepe } from "../crepe";
import type { LinkProvider } from "../links";
import { SLASH_CHOICES } from "../menus/catalog";
import { startLink } from "../menus/mention";
import { openNote } from "../session";

let crepe: Crepe | undefined;
let root: HTMLElement | undefined;

afterEach(async () => {
  await crepe?.destroy();
  root?.remove();
  crepe = undefined;
  document.querySelector(".kasten-menu")?.remove();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("embedding a page from the slash menu", () => {
  it("is offered with the media blocks", () => {
    expect(SLASH_CHOICES.find((c) => c.key === "embed")).toMatchObject({ label: "Embed a page", action: { type: "link", mode: "embed" } });
  });

  it("puts the picked page's embed on its own line", async () => {
    const links: LinkProvider = {
      pages: () => [
        { title: "Packing list", path: "library/packing-list.md" },
        { title: "Trip plans", path: "library/trip-plans.md" },
      ],
      open: vi.fn(),
      embed: () => null,
    };
    root = document.createElement("div");
    document.body.append(root);
    crepe = await createKastenCrepe(root, { links });
    const note = openNote(crepe, "Intro\n");
    const view = crepe.editor.ctx.get(editorViewCtx);
    const size = view.state.doc.content.size;
    const tr = view.state.tr.insert(size, view.state.schema.nodes.paragraph!.create());
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, size + 1)));
    startLink(view, size + 1, "embed");
    for (const char of "pack") view.dispatch(view.state.tr.insertText(char));
    const items = [...document.querySelectorAll<HTMLElement>(".kasten-menu .kasten-menu-item")];
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining("Packing list")]);
    items[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    items[0]!.click();
    await settle();
    expect(note.save()).toContain("Intro\n\n![[Packing list]]\n");
  });
});
