// Pasted and dropped files land in the page as links to where the vault
// keeps them: pictures as image blocks, other files as links.

import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createKastenCrepe } from "./crepe";
import { BLOCK_CHOICES } from "./menus/catalog";
import { choiceCommand } from "./menus/slash";
import type { FileProvider } from "./files";
import { insertFiles, onlyPicture } from "./paste-files";
import { openNote, type OpenNote } from "./session";

let crepe: Crepe | undefined;
let root: HTMLElement | undefined;

afterEach(async () => {
  await crepe?.destroy();
  root?.remove();
  crepe = undefined;
});

const png = (name = "image.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const sheet = () => new File([new Uint8Array([4])], "Trip budget.xlsx", { type: "application/vnd.ms-excel" });

function provider(links: Record<string, string> = {}): FileProvider & { saved: string[] } {
  const saved: string[] = [];
  return {
    saved,
    save: vi.fn(async (file: File) => {
      saved.push(file.name);
      const link = links[file.name];
      if (!link) throw new Error(`Cannot keep “${file.name}”`);
      return link;
    }),
    url: (src) => (src.startsWith("../assets/") ? `asset://vault/${src.slice(3)}` : src),
  };
}

async function open(body: string, files: FileProvider): Promise<OpenNote> {
  root = document.createElement("div");
  document.body.append(root);
  crepe = await createKastenCrepe(root, { files });
  return openNote(crepe, body);
}

const view = () => crepe!.editor.ctx.get(editorViewCtx);

/** Puts the caret `offset` characters into the first textblock with `text`. */
function caretIn(text: string, offset: number): number {
  let at = -1;
  view().state.doc.descendants((node, pos) => {
    if (at < 0 && node.isTextblock && node.textContent.includes(text)) at = pos + 1 + node.textContent.indexOf(text) + offset;
  });
  view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, at)));
  return at;
}

describe("pasted files", () => {
  it("puts a picture under the line it was pasted on, linked relatively", async () => {
    const files = provider({ "image.png": "../assets/pasted-image.png" });
    const note = await open("# Trip\n\nDay one in Hilltown.\n\nDay two.\n", files);
    await insertFiles(view(), files, [png()], caretIn("Hilltown", 2));
    expect(note.save()).toBe("# Trip\n\nDay one in Hilltown.\n\n![](../assets/pasted-image.png)\n\nDay two.\n");
    const img = root!.querySelector<HTMLImageElement>(".milkdown-image-block img");
    expect(img?.getAttribute("src")).toBe("asset://vault/assets/pasted-image.png");
  });

  it("puts other files in the text as links", async () => {
    const files = provider({ "Trip budget.xlsx": "../assets/trip-budget.xlsx" });
    const note = await open("See the numbers.\n", files);
    await insertFiles(view(), files, [sheet()], caretIn("See ", 4));
    expect(note.save()).toBe("See [Trip budget.xlsx](../assets/trip-budget.xlsx) the numbers.\n");
    await insertFiles(view(), files, [sheet()], caretIn("numbers.", 7));
    expect(note.save()).toBe("See [Trip budget.xlsx](../assets/trip-budget.xlsx) the numbers [Trip budget.xlsx](../assets/trip-budget.xlsx).\n");
  });

  it("leaves out a file that could not be kept, and the placeholder goes", async () => {
    const files = provider({ "a.png": "../assets/a.png" });
    const note = await open("Photos:\n", files);
    await insertFiles(view(), files, [png("a.png"), png("b.png")], caretIn("Photos", 0));
    expect(files.saved).toEqual(["a.png", "b.png"]);
    expect(note.save()).toBe("Photos:\n\n![](../assets/a.png)\n");
    expect(root!.querySelector(".kasten-saving")).toBeNull();
  });

  it("takes a pasted screenshot, but not the picture Office puts beside copied text", async () => {
    const files = provider({ "image.png": "../assets/shot.png" });
    await open("Notes\n", files);
    caretIn("Notes", 5);
    const paste = (html: string) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { files: [png()], getData: (type: string) => (type === "text/html" ? html : "") } });
      view().dom.dispatchEvent(event);
      return event;
    };
    paste("<table><tr><td>Budget</td><td>1200</td></tr></table>");
    expect(files.saved).toEqual([]);
    expect(view().state.doc.textContent).toContain("Budget");
    expect(paste("").defaultPrevented).toBe(true);
    expect(files.saved).toEqual(["image.png"]);
  });
});

describe("the File command", () => {
  it("attaches the files picked in the system's picker", async () => {
    const files = provider({ "Trip budget.xlsx": "../assets/trip-budget.xlsx" });
    const note = await open("Costs:\n", files);
    caretIn("Costs:", 6);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", { value: [sheet()] });
      this.dispatchEvent(new Event("change"));
    });
    const choice = BLOCK_CHOICES.find((c) => c.key === "file")!;
    expect(choiceCommand(choice, crepe!.editor.ctx)(view().state, view().dispatch, view())).toBe(true);
    click.mockRestore();
    await vi.waitFor(() => expect(note.save()).toBe("Costs: [Trip budget.xlsx](../assets/trip-budget.xlsx)\n"));
  });
});

describe("copied HTML", () => {
  it("is only a picture when it has one image and no text", () => {
    expect(onlyPicture('<meta charset="utf-8"><img src="https://example.com/a.png" alt="">')).toBe(true);
    expect(onlyPicture("<p>Some text</p><img src=a.png>")).toBe(false);
    expect(onlyPicture("<img src=a.png><img src=b.png>")).toBe(false);
    expect(onlyPicture("<table><tr><td><img src=a.png></td></tr></table>")).toBe(false);
  });
});
