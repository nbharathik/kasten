import { describe, expect, it } from "vitest";

import type { NoteMeta, TagSchema } from "../../../lib/vault/types";
import { relatedFrom, relatedNote } from "./related";

const note = (path: string, title: string, extra: Partial<NoteMeta> = {}): NoteMeta => ({
  path,
  id: null,
  title,
  kind: "card",
  icon: null,
  cover: null,
  parent: null,
  project: null,
  tags: [],
  modified: 0,
  created: null,
  updated: null,
  excerpt: "",
  words: 0,
  props: {},
  locked: false,
  ...extra,
});

const paper: TagSchema = {
  name: "paper",
  path: "tags/paper.yaml",
  color: null,
  icon: null,
  views: [],
  properties: [
    { key: "related", type: "relation", options: [] },
    { key: "status", type: "select", options: ["Idea", "Drafting"] },
  ],
} as unknown as TagSchema;

const target = note("library/photo-diff.md", "Photo diff", { id: "01K5Y2WE1C0MEPAGE000000009" });

describe("relations from the other end", () => {
  it("finds notes pointing here by id, in any property, and names the property", () => {
    const notes = [
      target,
      note("library/b.md", "B paper", { tags: ["paper"], props: { related: ["01K5Y2WE1C0MEPAGE000000009", "01OTHER"] } }),
      note("library/a.md", "A plan", { props: { depends_on: "01K5Y2WE1C0MEPAGE000000009" } }),
      note("library/c.md", "C unrelated", { tags: ["paper"], props: { related: ["01OTHER"], status: "Idea" } }),
    ];
    expect(relatedFrom(notes, target, [paper]).map((r) => [r.note.title, r.keys])).toEqual([
      ["A plan", ["depends_on"]],
      ["B paper", ["related"]],
    ]);
  });

  it("takes a title only where a schema says the property is a relation", () => {
    const notes = [
      target,
      note("library/d.md", "D by title", { tags: ["Paper"], props: { related: ["[[photo diff|the diff]]"] } }),
      note("library/e.md", "E status", { tags: ["paper"], props: { status: "Photo diff" } }),
      note("library/f.md", "F no schema", { props: { related: "Photo diff" } }),
      note("templates/paper.md", "Template", { kind: "template", tags: ["paper"], props: { related: ["Photo diff"] } }),
    ];
    expect(relatedFrom(notes, target, [paper]).map((r) => r.note.title)).toEqual(["D by title"]);
  });

  it("takes a path, and never a title another note shares", () => {
    const namesake = note("projects/trip/photo-diff.md", "Photo diff", { project: "trip" });
    const notes = [
      target,
      namesake,
      note("library/i.md", "I by path", { tags: ["paper"], props: { related: ["library/photo-diff"] } }),
      note("library/j.md", "J by shared title", { tags: ["paper"], props: { related: ["Photo diff"] } }),
      note("library/k.md", "K by the other path", { tags: ["paper"], props: { related: ["projects/trip/photo-diff.md"] } }),
    ];
    expect(relatedFrom(notes, target, [paper]).map((r) => r.note.title)).toEqual(["I by path"]);
    expect(relatedFrom(notes, namesake, [paper]).map((r) => r.note.title)).toEqual(["K by the other path"]);
  });

  it("finds nothing for a note without an id or relations", () => {
    const loose = note("library/g.md", "", {});
    expect(relatedFrom([loose, note("library/h.md", "H", { props: { related: [""] } })], loose, [paper])).toEqual([]);
  });
});

describe("the note a relation value names", () => {
  const namesake = note("projects/trip/photo-diff.md", "Photo diff", { project: "trip" });
  const template = note("templates/paper.md", "Paper", { kind: "template", id: "01TEMPLATE" });
  const solo = note("library/solo.md", "Solo");
  const notes = [target, namesake, template, solo];

  it("goes by id, by path with or without .md, and by a title only one note has", () => {
    expect(relatedNote(notes, "01K5Y2WE1C0MEPAGE000000009")?.path).toBe("library/photo-diff.md");
    expect(relatedNote(notes, "projects/trip/photo-diff")?.path).toBe("projects/trip/photo-diff.md");
    expect(relatedNote(notes, " library/photo-diff.md ")?.path).toBe("library/photo-diff.md");
    expect(relatedNote(notes, "[[solo|the one]]")?.path).toBe("library/solo.md");
    expect(relatedNote(notes, "01TEMPLATE")?.path).toBe("templates/paper.md");
  });

  it("never guesses among namesakes, and never finds a template by title", () => {
    expect(relatedNote(notes, "Photo diff")).toBeUndefined();
    expect(relatedNote(notes, "Paper")).toBeUndefined();
    expect(relatedNote(notes, "")).toBeUndefined();
    expect(relatedNote(notes, "library/gone.md")).toBeUndefined();
  });
});
