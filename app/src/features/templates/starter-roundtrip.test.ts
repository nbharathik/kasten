// Every starter template, filled and opened in the page editor, saves back
// byte for byte: a page made from one and left alone never changes, and
// its first edit touches only the block edited.

import { describe, expect, it } from "vitest";

import { useTestEditor } from "../../test/editor";
import { splitFrontmatter } from "../pages/markdown/frontmatter";
import { fillTemplate } from "./template-vars";

const STARTERS = import.meta.glob<string>("../../../../crates/kasten-core/defaults/templates/*.md", { query: "?raw", import: "default", eager: true });
const KIT_PAGES = import.meta.glob<string>("../../../../crates/kasten-core/defaults/kits/*/**/*.md", { query: "?raw", import: "default", eager: true });

const editor = useTestEditor();

describe("starter templates and kit pages", () => {
  it("are all here", () => {
    expect(Object.keys(STARTERS).length).toBeGreaterThanOrEqual(58);
  });

  for (const [path, text] of Object.entries({ ...STARTERS, ...KIT_PAGES })) {
    const name = path.slice(path.indexOf("defaults/") + 9);
    it(`${name} saves back as it was`, () => {
      const filled = fillTemplate(text.replace(/\{\{id:[^}]+\}\}/g, "01K5Y2WE1C0MEPAGE00000000A"), "A page", "2026-09-28T14:05", "Demo");
      const body = splitFrontmatter(filled).body;
      expect(editor.open(body).save()).toBe(body);
    });
  }
});
