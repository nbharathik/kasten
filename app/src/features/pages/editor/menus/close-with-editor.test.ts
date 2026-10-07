// Menus and peeks opened over a page go when the page does, so none is left
// on screen acting on an editor that has gone.

import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createKastenCrepe } from "../crepe";
import type { LinkProvider } from "../links";
import { openNote } from "../session";

const links: LinkProvider = {
  pages: () => [{ title: "Trip plan" }],
  open: vi.fn(),
  preview: vi.fn(async (title: string) => ({ title, text: "Days one to three." })),
};

let root: HTMLElement | undefined;
let crepe: Crepe | undefined;

afterEach(async () => {
  await crepe?.destroy();
  crepe = undefined;
  root?.remove();
  document.querySelectorAll(".kasten-menu, .kasten-peek").forEach((el) => el.remove());
});

async function open(body: string) {
  root = document.createElement("div");
  document.body.append(root);
  crepe = await createKastenCrepe(root, { links });
  openNote(crepe, body);
  return crepe.editor.ctx.get(editorViewCtx);
}

describe("menus over a page", () => {
  it("close when its editor goes", async () => {
    const view = await open("One\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(document.querySelector('.kasten-menu[aria-label="Block menu"]')).not.toBeNull();
    await crepe!.destroy();
    crepe = undefined;
    expect(document.querySelector(".kasten-menu")).toBeNull();
  });

  it("take a link's peek away with the link", async () => {
    const view = await open("See [[Trip plan]] here.\n");
    view.dom.querySelector(".kasten-mention")!.dispatchEvent(new MouseEvent("mouseenter"));
    await new Promise((resolve) => setTimeout(resolve, 520));
    expect(document.querySelector(".kasten-peek")).not.toBeNull();
    // The page reloads with other text: the link is gone, and its peek too.
    openNote(crepe!, "Other text.\n");
    expect(document.querySelector(".kasten-peek")).toBeNull();
  });
});
