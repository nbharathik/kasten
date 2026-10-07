// What the editor's stylesheets say about selecting text. Style sheets are not laid out in tests, so these read the rules as text:
// the rule that stops the page being selected while elements are dragged must leave the open text box selectable, and every
// `user-select` says it for WebKit too (Safari and the desktop webviews built on it need the prefixed name).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import canvasCss from "./canvas/canvas.css?raw";
import editorCss from "./editor.css?raw";
import outlineCss from "./outline/outline.css?raw";

const here = import.meta.dirname;

/** Every style sheet under the editor's folder, with its text. */
function sheets(dir = here): { file: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sheets(path);
    return name.endsWith(".css") ? [{ file: relative(here, path).split(sep).join("/"), text: readFileSync(path, "utf8") }] : [];
  });
}

/** A style sheet's rules as text, without its comments. */
const rulesOf = (css: string): RegExpMatchArray[] => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];

/** The declarations of the rules whose selector list contains `selector` exactly, together. */
function rule(css: string, selector: string): string {
  const found = rulesOf(css).filter((match) => match[1]!.split(",").some((s) => s.trim() === selector));
  if (found.length === 0) throw new Error(`No rule for ${selector}`);
  return found.map((match) => match[2]!).join("\n");
}

describe("the page and the text box open on it", () => {
  it("keeps the slide from being selected while elements are dragged, for WebKit too", () => {
    const page = rule(canvasCss, ".ks-page");
    expect(page).toMatch(/user-select:\s*none/);
    expect(page).toMatch(/-webkit-user-select:\s*none/);
  });

  it("makes the text being edited selectable again, however deep in the page it is, for WebKit too", () => {
    for (const selector of [".ks-page .ks-text-layer", ".ks-page .ks-text-layer *"]) {
      const layer = rule(canvasCss, selector);
      expect(layer, selector).toMatch(/(?<!-webkit-)user-select:\s*text/);
      expect(layer, selector).toMatch(/-webkit-user-select:\s*text/);
    }
  });
});

describe("the outline's ghosts", () => {
  it("are text laid over the fields that can be selected but not seen, and let the pointer through once the field has the focus", () => {
    const ghost = rule(outlineCss, ".ks-ol-ghost");
    expect(ghost).toMatch(/color:\s*transparent/);
    expect(ghost).toMatch(/(?<!-webkit-)user-select:\s*text/);
    expect(ghost).toMatch(/-webkit-user-select:\s*text/);
    expect(rule(outlineCss, ".ks-ol-field:focus-within .ks-ol-ghost")).toMatch(/pointer-events:\s*none/);
  });

  it("are the only highlight of words selected across rows: a field without the focus adds none of its own", () => {
    expect(rule(outlineCss, ".ks-ol-title:not(:focus)::selection")).toMatch(/background:\s*transparent/);
    expect(rule(outlineCss, ".ks-ol-body:not(:focus)::selection")).toMatch(/background:\s*transparent/);
    expect(rule(outlineCss, ".ks-ol-ghost::selection")).toMatch(/background:/);
  });

  it("leave out of the selection the numbers and marks beside the rows", () => {
    expect(rule(outlineCss, ".ks-ol-side")).toMatch(/(?<!-webkit-)user-select:\s*none/);
  });
});

describe("controls and fields", () => {
  it("leave buttons, menus and toolbars unselectable, for WebKit too", () => {
    for (const selector of [".ks-btn", ".ks-menubar", ".ks-toolbar", ".ks-menu-item", ".ks-seg"]) {
      const body = rule(editorCss, selector);
      expect(body, selector).toMatch(/(?<!-webkit-)user-select:\s*none/);
      expect(body, selector).toMatch(/-webkit-user-select:\s*none/);
    }
  });

  it("keep every input and text area selectable and typeable, wherever it sits", () => {
    const body = rule(editorCss, ".ks-editor input");
    expect(body).toMatch(/(?<!-webkit-)user-select:\s*text/);
    expect(body).toMatch(/-webkit-user-select:\s*text/);
    expect(rule(editorCss, ".ks-editor textarea")).toBe(body);
  });
});

// Words a person may want to copy: what a dialog says, what a panel explains, an error, a lint problem, a work of the bibliography, the
// details of an image. Nothing in the sheets of these places turns selection off (the lists of tiles and thumbnails, which are pictures
// to pick, do, in their own sheets).
describe("the sheets of the places that hold words to read", () => {
  it("never turn text selection off", () => {
    const places = ["dialogs", "lint", "panels", "titlebar", "citations", "notes", "menus", "toolbar"];
    const offending: string[] = [];
    for (const { file, text } of sheets()) {
      if (!places.some((place) => file.startsWith(`${place}/`))) continue;
      for (const match of rulesOf(text)) {
        if (/user-select:\s*none/.test(match[2]!)) offending.push(`${file}: ${match[1]!.trim()}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it("leave the images drawer's words selectable: only its grid of tiles is not", () => {
    const gallery = sheets().find((sheet) => sheet.file === "gallery/gallery.css")!;
    const off = rulesOf(gallery.text).filter((match) => /user-select:\s*none/.test(match[2]!));
    expect(off.map((match) => match[1]!.trim())).toEqual([".ks-gal-list"]);
  });
});

describe("every rule that stops text being selected", () => {
  it("names the WebKit property beside the standard one", () => {
    const missing: string[] = [];
    for (const { file, text } of sheets()) {
      for (const match of rulesOf(text)) {
        const body = match[2]!;
        const plain = /(?<!-webkit-)user-select:\s*(none|text|all)/.exec(body);
        if (plain && !new RegExp(`-webkit-user-select:\\s*${plain[1]}`).test(body)) missing.push(`${file}: ${match[1]!.trim().split("\n").pop()}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
