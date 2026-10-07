// The link rules for pages that share a title, the same cases as
// kasten-core's links tests.

import { describe, expect, it } from "vitest";

import type { NoteMeta } from "../../lib/vault/types";
import { Directory, keepLinks, linkParts, linkSpans, type Place } from "./links";

function note(path: string, title: string): NoteMeta {
  const project = /^projects\/([^/]+)\//.exec(path)?.[1] ?? null;
  return {
    path,
    id: null,
    title,
    kind: path.startsWith("templates/") ? "template" : "page",
    icon: null,
    cover: null,
    parent: null,
    project,
    tags: [],
    modified: 0,
    created: null,
    updated: null,
    excerpt: "",
    words: 0,
    props: {},
    locked: false,
  };
}

const vault = () => [
  note("library/reading.md", "Reading"),
  note("library/either-or.md", "Either/or"),
  note("projects/trip/pages/test.md", "Test"),
  note("projects/trip/pages/test-2.md", "Test"),
  note("projects/home/pages/test.md", "Test"),
  note("projects/trip/pages/plan.md", "Plan"),
  note("projects/home/pages/plan.md", "Plan"),
  note("library/notes.md", "Notes"),
  note("templates/notes.md", "Notes"),
];

const place = (path: string): Place => ({ path, project: /^projects\/([^/]+)\//.exec(path)?.[1] ?? null });
const pathOf = (dir: Directory, target: string, from: string) => {
  const found = dir.resolve(target, place(from));
  return found && "note" in found ? found.note.path : found ? found.choices.map((n) => n.path) : null;
};

/** `vault()` with `path` renamed to `title` and moved to `to`. */
function renamed(path: string, title: string, to: string): NoteMeta[] {
  return vault().map((n) => (n.path === path ? { ...n, title, path: to, project: /^projects\/([^/]+)\//.exec(to)?.[1] ?? null } : n));
}

describe("following a link", () => {
  it("goes to a title's own note in any case, by path whatever the title, and never to a template", () => {
    const dir = new Directory(vault());
    expect(pathOf(dir, "Reading", "library/diary.md")).toBe("library/reading.md");
    expect(pathOf(dir, " reading ", "library/diary.md")).toBe("library/reading.md");
    expect(pathOf(dir, "Nothing here", "library/diary.md")).toBeNull();
    expect(pathOf(dir, "Either/or", "library/diary.md")).toBe("library/either-or.md");
    expect(pathOf(dir, "Notes", "library/diary.md")).toBe("library/notes.md");
    for (const target of ["projects/home/pages/test", "Projects/Home/pages/TEST", "projects/home/pages/test.md"]) {
      expect(pathOf(dir, target, "library/diary.md")).toBe("projects/home/pages/test.md");
    }
    expect(pathOf(dir, "templates/notes", "library/diary.md")).toBeNull();
  });

  it("takes a shared title's note from the same project, else asks", () => {
    const dir = new Directory(vault());
    expect(pathOf(dir, "Plan", "projects/home/pages/list.md")).toBe("projects/home/pages/plan.md");
    expect(pathOf(dir, "Plan", "projects/trip/pages/list.md")).toBe("projects/trip/pages/plan.md");
    expect(pathOf(dir, "Plan", "library/diary.md")).toEqual(["projects/home/pages/plan.md", "projects/trip/pages/plan.md"]);
    expect(pathOf(dir, "Test", "projects/trip/pages/list.md")).toEqual(["projects/trip/pages/test-2.md", "projects/trip/pages/test.md"]);
  });

  it("reads a note's link to its own title as another note's", () => {
    const dir = new Directory(vault());
    expect(pathOf(dir, "Test", "projects/trip/pages/test.md")).toBe("projects/trip/pages/test-2.md");
    expect(pathOf(dir, "Test", "projects/trip/pages/test-2.md")).toBe("projects/trip/pages/test.md");
    expect(pathOf(dir, "Reading", "library/reading.md")).toBe("library/reading.md");
  });

  it("writes a link by title when that finds the note, else by path", () => {
    const notes = vault();
    const dir = new Directory(notes);
    expect(dir.inner(notes[0]!, place("projects/trip/pages/x.md"))).toBe("Reading");
    expect(dir.inner(notes[6]!, place("projects/home/pages/x.md"))).toBe("Plan");
    expect(dir.inner(notes[6]!, place("library/diary.md"))).toBe("projects/home/pages/plan|Plan");
  });
});

describe("a link's text", () => {
  it("splits into target, heading and alias", () => {
    expect(linkParts("Title")).toEqual({ target: "Title", heading: null, alias: null });
    expect(linkParts(" Title #Goals| the goals ")).toEqual({ target: "Title", heading: "Goals", alias: " the goals " });
    expect(linkParts("a/b|B")).toEqual({ target: "a/b", heading: null, alias: "B" });
  });

  it("is found where the index finds links", () => {
    const body = "See [[A]] and ![[B#h|x]].\n`[[code]]` \\[[escaped]] [[]] [[x[y]]\n```\n[[fenced]]\n```\n[[C]]";
    expect(linkSpans(body).map(([start, end]) => body.slice(start, end))).toEqual(["A", "B#h|x", "C"]);
  });
});

describe("keeping links where they went", () => {
  const moved = (pairs: [string, string][]) => new Map(pairs);

  it("points a renamed note's links at its new title, heading and alias kept", () => {
    const [before, after] = [new Directory(vault()), new Directory(renamed("library/reading.md", "Books", "library/books.md"))];
    const from = place("library/diary.md");
    const body = "[[Reading]], ![[reading#Now|what I read]] and [[Reading|Reading]] [[Plan]]\n";
    expect(keepLinks(body, before, after, moved([["library/reading.md", "library/books.md"]]), from, from)).toBe(
      "[[Books]], ![[Books#Now|what I read]] and [[Books]] [[Plan]]\n",
    );
    expect(keepLinks("[[Notes]] and text", before, after, new Map(), from, from)).toBeNull();
  });

  it("names the path when a new title is in use nearer the link", () => {
    const [before, after] = [new Directory(vault()), new Directory(renamed("library/reading.md", "Plan", "library/plan.md"))];
    const from = place("projects/trip/pages/list.md");
    expect(keepLinks("[[Reading]] then [[Plan]]", before, after, moved([["library/reading.md", "library/plan.md"]]), from, from)).toBe(
      "[[library/plan|Plan]] then [[Plan]]",
    );
  });

  it("keeps links whose title a nearer note took, and follows path links", () => {
    let [before, after] = [new Directory(vault()), new Directory(renamed("projects/home/pages/test.md", "Reading", "projects/home/pages/reading.md"))];
    const home = place("projects/home/pages/list.md");
    expect(keepLinks("[[Reading]]", before, after, moved([["projects/home/pages/test.md", "projects/home/pages/reading.md"]]), home, home)).toBe(
      "[[library/reading|Reading]]",
    );
    [before, after] = [new Directory(vault()), new Directory(renamed("projects/home/pages/plan.md", "Plan", "library/plan.md"))];
    const map = moved([["projects/home/pages/plan.md", "library/plan.md"]]);
    expect(keepLinks("[[Plan]]", before, after, map, home, home)).toBe("[[library/plan|Plan]]");
    const diary = place("library/diary.md");
    expect(keepLinks("[[projects/home/pages/plan|Plan]]", before, after, map, diary, diary)).toBe("[[Plan]]");
  });

  it("leaves links that asked, or found nothing, as written", () => {
    const [before, after] = [new Directory(vault()), new Directory(renamed("projects/trip/pages/plan.md", "Route", "projects/trip/pages/route.md"))];
    const diary = place("library/diary.md");
    expect(keepLinks("[[Plan]] [[Gone]]", before, after, moved([["projects/trip/pages/plan.md", "projects/trip/pages/route.md"]]), diary, diary)).toBeNull();
  });

  it("keeps a moved note's own links", () => {
    const [before, after] = [new Directory(vault()), new Directory(renamed("projects/trip/pages/test.md", "Test", "projects/home/pages/test-2.md"))];
    const map = moved([["projects/trip/pages/test.md", "projects/home/pages/test-2.md"]]);
    expect(keepLinks("[[Plan]]", before, after, map, place("projects/trip/pages/test.md"), place("projects/home/pages/test-2.md"))).toBe(
      "[[projects/trip/pages/plan|Plan]]",
    );
  });
});
