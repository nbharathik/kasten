import { describe, expect, it } from "vitest";

import type { NoteMeta } from "../../lib/vault/types";
import { arrangeProjects, groupOf, isArchived, moved, partitionArchived, projectKey, reorder, slotOf, targetOf } from "./project-order";

function project(folder: string, title = folder, props: Record<string, unknown> = {}): NoteMeta {
  return {
    path: `projects/${folder}/_project.md`,
    id: null,
    title,
    kind: "project",
    icon: null,
    cover: null,
    parent: null,
    project: folder,
    tags: [],
    modified: 0,
    created: null,
    updated: null,
    excerpt: "",
    words: 0,
    props,
    locked: false,
  };
}

const keys = (list: readonly NoteMeta[]) => list.map(projectKey);
const none = { projectOrder: [], pinnedProjects: [] };

describe("arrangeProjects", () => {
  const list = [project("gamma", "Gamma"), project("alpha", "Alpha"), project("p10", "Project 10"), project("p2", "Project 2"), project("beta", "beta")];

  it("lists projects by title when nothing is arranged, numbers by value", () => {
    expect(keys(arrangeProjects(list, none))).toEqual(["alpha", "beta", "gamma", "p2", "p10"]);
  });

  it("puts arranged projects first in their order, then new ones by title", () => {
    const shown = arrangeProjects(list, { projectOrder: ["p10", "gamma"], pinnedProjects: [] });
    expect(keys(shown)).toEqual(["p10", "gamma", "alpha", "beta", "p2"]);
  });

  it("puts pinned projects first, in their arranged order rather than the order they were pinned", () => {
    const shown = arrangeProjects(list, { projectOrder: ["p10", "gamma", "alpha"], pinnedProjects: ["alpha", "p10"] });
    expect(keys(shown)).toEqual(["p10", "alpha", "gamma", "beta", "p2"]);
    // A pinned project nobody arranged still comes first, among pinned ones after the arranged.
    expect(keys(arrangeProjects(list, { projectOrder: ["gamma"], pinnedProjects: ["beta", "gamma"] }))).toEqual(["gamma", "beta", "alpha", "p2", "p10"]);
  });

  it("ignores names of projects that are not there", () => {
    const shown = arrangeProjects(list, { projectOrder: ["gone", "beta", "trashed"], pinnedProjects: ["gone"] });
    expect(keys(shown)).toEqual(["beta", "alpha", "gamma", "p2", "p10"]);
  });

  it("never drops or repeats a project, even with odd keys", () => {
    const loose: NoteMeta = { ...project("x", "Loose"), path: "library/loose.md", project: null };
    const twin = { ...project("alpha", "Alpha twin"), path: "projects/alpha/pages/twin.md" };
    const all = [...list, loose, twin];
    const shown = arrangeProjects(all, { projectOrder: ["alpha", "alpha", "library/loose.md"], pinnedProjects: ["alpha"] });
    expect(shown).toHaveLength(all.length);
    expect(new Set(shown)).toEqual(new Set(all));
    expect(shown.slice(0, 3).map((n) => n.title)).toEqual(["Alpha", "Alpha twin", "Loose"]);
    expect(projectKey(loose)).toBe("library/loose.md");
  });

  it("leaves its input alone", () => {
    const input = [...list];
    arrangeProjects(input, { projectOrder: ["p2"], pinnedProjects: ["beta"] });
    expect(input).toEqual(list);
  });
});

describe("archived projects", () => {
  it("reads `archived: true` from the project's properties", () => {
    expect(isArchived(project("a", "A", { archived: true }))).toBe(true);
    expect(isArchived(project("a", "A", { archived: "true" }))).toBe(true);
    expect(isArchived(project("a", "A", { archived: false }))).toBe(false);
    expect(isArchived(project("a", "A", { status: "Done" }))).toBe(false);
  });

  it("splits projects into active and archived, keeping their order", () => {
    const list = [project("a"), project("b", "b", { archived: true }), project("c"), project("d", "d", { archived: true })];
    const { active, archived } = partitionArchived(list);
    expect(keys(active)).toEqual(["a", "c"]);
    expect(keys(archived)).toEqual(["b", "d"]);
  });
});

describe("moved", () => {
  it("moves one item forwards or backwards", () => {
    expect(moved(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moved(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moved(["a", "b", "c", "d"], 1, 1)).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps the target and ignores a missing item, never changing its input", () => {
    const list = ["a", "b", "c"];
    expect(moved(list, 0, 9)).toEqual(["b", "c", "a"]);
    expect(moved(list, 2, -4)).toEqual(["c", "a", "b"]);
    expect(moved(list, 5, 0)).toEqual(["a", "b", "c"]);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("drop slots", () => {
  it("turns an insertion slot into the index the item lands on, and back", () => {
    // Four rows; slots 0..4 sit before each row and after the last.
    expect(targetOf(1, 0)).toBe(0);
    expect(targetOf(1, 1)).toBe(1);
    expect(targetOf(1, 2)).toBe(1);
    expect(targetOf(1, 4)).toBe(3);
    expect(slotOf(1, 0)).toBe(0);
    expect(slotOf(1, 3)).toBe(4);
    expect(slotOf(1, 1)).toBe(1);
  });
});

describe("groupOf", () => {
  it("gives the rows a project may move among: pinned ones or the rest", () => {
    const shown = ["p1", "p2", "a", "b", "c"];
    const pins = ["p2", "p1"];
    expect(groupOf(shown, pins, 1)).toEqual({ start: 0, end: 1 });
    expect(groupOf(shown, pins, 3)).toEqual({ start: 2, end: 4 });
    expect(groupOf(["a", "b"], [], 0)).toEqual({ start: 0, end: 1 });
  });
});

describe("reorder", () => {
  const arrangement = (projectOrder: string[], pinnedProjects: string[] = []) => ({ projectOrder, pinnedProjects });
  /** What the sidebar shows for `order` and `pins` over these projects. */
  const show = (folders: string[], order: string[], pins: string[] = []) => keys(arrangeProjects(folders.map((f) => project(f)), arrangement(order, pins)));

  it("gives every shown project a place when the first move is made", () => {
    expect(reorder(arrangement([]), ["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(reorder(arrangement(["c"]), ["c", "a", "b"], 0, 2)).toEqual(["a", "b", "c"]);
  });

  it("keeps names it does not show (archived, in the trash) where they were", () => {
    // `x` is archived, `gone` is in the trash: neither is shown.
    const next = reorder(arrangement(["a", "x", "b", "gone", "c"]), ["a", "b", "c"], 2, 0);
    expect(next).toEqual(["c", "a", "x", "b", "gone"]);
    expect(show(["a", "b", "c"], next)).toEqual(["c", "a", "b"]);
    // Unarchived, `x` is back between a and b.
    expect(show(["a", "b", "c", "x"], next)).toEqual(["c", "a", "x", "b"]);
  });

  it("moves a project to the end of the list", () => {
    const next = reorder(arrangement(["a", "b", "x", "c"]), ["a", "b", "c"], 0, 2);
    expect(show(["a", "b", "c"], next)).toEqual(["b", "c", "a"]);
  });

  it("reorders pinned projects among themselves", () => {
    const order = ["a", "p1", "b", "p2", "c"];
    const pins = ["p1", "p2"];
    const shown = show(["a", "b", "c", "p1", "p2"], order, pins);
    expect(shown).toEqual(["p1", "p2", "a", "b", "c"]);
    const down = reorder(arrangement(order, pins), shown, 0, 1);
    expect(show(["a", "b", "c", "p1", "p2"], down, pins)).toEqual(["p2", "p1", "a", "b", "c"]);
    const up = reorder(arrangement(order, pins), shown, 1, 0);
    expect(show(["a", "b", "c", "p1", "p2"], up, pins)).toEqual(["p2", "p1", "a", "b", "c"]);
  });

  it("keeps a move inside the project's own group", () => {
    const order = ["p1", "a", "b"];
    const pins = ["p1"];
    const shown = ["p1", "a", "b"];
    // An unpinned project dropped above a pinned one stays first among the unpinned.
    const next = reorder(arrangement(order, pins), shown, 2, 0);
    expect(show(["a", "b", "p1"], next, pins)).toEqual(["p1", "b", "a"]);
    // A pinned project dropped among the unpinned stays pinned, where it was.
    expect(show(["a", "b", "p1"], reorder(arrangement(order, pins), shown, 0, 2), pins)).toEqual(["p1", "a", "b"]);
  });

  it("gives an unpinned project back its place among the rest", () => {
    const order = ["a", "b", "c"];
    const pinned = show(["a", "b", "c"], order, ["b"]);
    expect(pinned).toEqual(["b", "a", "c"]);
    expect(show(["a", "b", "c"], order, [])).toEqual(["a", "b", "c"]);
  });

  it("changes nothing for a move to the same place or of a row that is not there", () => {
    expect(reorder(arrangement(["b", "a"]), ["b", "a"], 1, 1)).toEqual(["b", "a"]);
    expect(reorder(arrangement(["b", "a"]), ["b", "a"], 7, 0)).toEqual(["b", "a"]);
  });
});
