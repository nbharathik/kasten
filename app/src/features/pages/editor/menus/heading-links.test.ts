// `[[Title#` offers that page's headings, read once, and links the pick.

import { describe, expect, it, vi } from "vitest";

import { useTestEditor } from "../../../../test/editor";
import { headingsOf } from "../../../workspace/page/page-headings";
import type { LinkProvider } from "../links";

let loaded: (() => void) | null = null;
let known: string[] | null = null;
const links: LinkProvider = {
  pages: () => [{ title: "Trip plans", path: "library/trip-plans.md" }],
  open: vi.fn(),
  headings: (_page, then) => {
    if (known) return known;
    loaded = then;
    return null;
  },
};
const editor = useTestEditor({ links });
const keys = () => [...document.querySelectorAll<HTMLElement>(".kasten-menu .kasten-menu-item")].map((row) => row.dataset.key);

describe("heading links", () => {
  it("list the page's headings once read, and link the pick", () => {
    editor.open("See\n").caret("See", true);
    editor.type(" [[Trip plans#");
    expect(keys()).toEqual([]);
    known = ["Packing", "Route", "Route back"];
    loaded?.();
    expect(keys()).toEqual(["heading:Packing", "heading:Route", "heading:Route back"]);
    editor.type("rou");
    expect(keys()).toEqual(["heading:Route", "heading:Route back"]);
    editor.press("Enter");
    expect(editor.save()).toBe("See [[Trip plans#Route]]\n");
  });

  it("are read from a page's text outside code", () => {
    expect(headingsOf("# Top\ntext\n## Packing ##\n```\n# not one\n```\n### Route")).toEqual(["Top", "Packing", "Route"]);
  });
});
