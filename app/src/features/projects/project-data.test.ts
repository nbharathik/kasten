import { describe, expect, it } from "vitest";

import type { BoardInfo, NoteMeta, TaskRow } from "../../lib/vault/types";
import { inFolder, partsOf, todoCounts } from "./project-data";

function note(path: string, fields: Partial<NoteMeta> = {}): NoteMeta {
  const project = /^projects\/([^/]+)\//.exec(path)?.[1] ?? null;
  const kind = path.endsWith("_project.md") ? "project" : path.includes("/cards/") ? "card" : "page";
  return { path, id: null, title: path.slice(path.lastIndexOf("/") + 1, -3), kind, icon: null, cover: null, parent: null, project, tags: [], modified: 1, created: null, updated: null, excerpt: "", words: 0, props: {}, locked: false, ...fields };
}

const PROJECT = note("projects/p/_project.md", { title: "P", modified: 5 });
const NOTES = [
  PROJECT,
  note("projects/p/pages/zeta.md", { id: "Z", modified: 10 }),
  note("projects/p/pages/alpha.md", { modified: 20 }),
  note("projects/p/pages/child.md", { parent: "Z", modified: 30 }),
  note("projects/p/cards/idea.md", { modified: 40 }),
  note("projects/q/pages/other.md", { modified: 50 }),
  note("library/loose.md", { modified: 60 }),
];
const BOARDS: BoardInfo[] = [
  { path: "projects/p/boards/map.canvas", title: "Map", project: "p", nodes: 3, modified: 70 },
  { path: "library/elsewhere.canvas", title: "Elsewhere", project: null, nodes: 0, modified: 80 },
];

describe("a project's parts", () => {
  it("gathers the project's pages, cards and boards, newest first", () => {
    const parts = partsOf(NOTES, BOARDS, PROJECT);
    expect(parts.recent.map((n) => n.title)).toEqual(["idea", "child", "alpha", "zeta"]);
    expect(parts.pages).toHaveLength(3);
    expect(parts.cards.map((n) => n.title)).toEqual(["idea"]);
    expect(parts.top.map((t) => [t.note.title, t.children])).toEqual([
      ["alpha", 0],
      ["zeta", 1],
    ]);
    expect(parts.boards.map((b) => b.title)).toEqual(["Map"]);
    expect(parts.edited).toBe(70);
  });

  it("counts the project's to-dos", () => {
    const row = (path: string, done: boolean): TaskRow => ({ path, title: "", icon: null, line: 0, done, text: "x", due: null });
    const rows = [row("projects/p/_project.md", false), row("projects/p/pages/a.md", true), row("projects/pp/pages/b.md", false), row("library/c.md", false)];
    const mine = rows.filter(inFolder("p"));
    expect(mine).toHaveLength(2);
    expect(todoCounts(mine)).toEqual({ open: 1, done: 1 });
  });
});
