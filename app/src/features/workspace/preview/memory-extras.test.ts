// The preview's schemas, properties, sections and boards behave like the core's.

import { describe, expect, it } from "vitest";

import { readBlock, readFlow, writeFlow } from "../../../lib/flow-yaml";
import { appendUnder, parseSchema } from "./memory-extras";
import { MemoryVault } from "./memory-vault";

const NOW = Date.UTC(2026, 8, 24, 8, 0, 0);
const PAPER = "name: paper\ncolor: blue\nproperties:\n  - {key: status, type: select, options: [Idea, Drafting]}\n  - {key: deadline, type: date}\nviews:\n  - {name: Pipeline, type: kanban, group_by: status}\n  - {name: All, type: table, sort: [{key: deadline, dir: asc}]}\n";
const DRAFT = "---\ntitle: Draft\ntags: [paper]\nprops:\n  status: Idea\n  deadline: 2026-12-01\n---\nIntro\n\n## Method\n\nOld method\n\n## Results\n\nNone yet\n";
const BOARD = '{"nodes":[{"id":"n1","type":"file","file":"library/draft.md","x":0,"y":0,"width":320,"height":180}],"edges":[]}';

const vault = () =>
  new MemoryVault({ "library/draft.md": DRAFT, "library/other.md": "---\ntitle: Other\n---\nSee [[Draft]]\n", "tags/paper.yaml": PAPER, "library/b.canvas": BOARD }, undefined, () => NOW);

describe("appendUnder", () => {
  it("appends at the end or under a heading, as sections.rs does", () => {
    expect(appendUnder("Hi\n", "More", null)).toBe("Hi\n\nMore\n");
    expect(appendUnder("", "First", null)).toBe("First\n");
    const body = "## Morning\n\n- tea\n\n## Notes\n\nText\n";
    expect(appendUnder(body, "- toast", "morning")).toBe("## Morning\n\n- tea\n- toast\n\n## Notes\n\nText\n");
    expect(appendUnder(body, "More", "## Notes")).toBe("## Morning\n\n- tea\n\n## Notes\n\nText\nMore\n");
    expect(appendUnder("## A", "x", "A")).toBe("## A\nx\n");
    expect(() => appendUnder(body, "x", "Evening")).toThrow("No heading");
  });

  it("continues a list that ends the body, as sections.rs does", () => {
    expect(appendUnder("A day.\n\n- [ ] Call the bank\n", "- [ ] Post the letter @2026-10-02", null)).toBe("A day.\n\n- [ ] Call the bank\n- [ ] Post the letter @2026-10-02\n");
    expect(appendUnder("1. one\r\n\r\n", "2. two", null)).toBe("1. one\r\n2. two\r\n");
    expect(appendUnder("- tea\n", "Later", null)).toBe("- tea\n\nLater\n");
    expect(appendUnder("Text\n", "- item", null)).toBe("Text\n\n- item\n");
    expect(appendUnder("-- dashes\n", "- item", null)).toBe("-- dashes\n\n- item\n");
  });

  it("appends through the preview vault and captures into a project", async () => {
    const v = new MemoryVault({ "projects/p/_project.md": "---\ntitle: P\ntype: project\n---\n## To-dos\n\n- [ ] One\n" }, undefined, () => NOW);
    const note = await v.append("projects/p/_project.md", "- [ ] Two", "To-dos");
    expect(note.text.endsWith("## To-dos\n\n- [ ] One\n- [ ] Two\n")).toBe(true);
    const card = await v.capture("Ring the venue", [], "p");
    expect(card.meta.path).toBe("projects/p/cards/ring-the-venue.md");
    await expect(v.capture("Lost", [], "nowhere")).rejects.toThrow("No project called nowhere");
  });
});

describe("flow YAML", () => {
  it("reads and writes one-line values", () => {
    expect(readFlow("{key: status, options: [Idea, 'Two words', \"q: x\"]}")).toEqual({ key: "status", options: ["Idea", "Two words", "q: x"] });
    expect(readFlow("[1, true, null]")).toEqual([1, true, null]);
    expect(writeFlow({ a: ["x y", "true", 3] })).toBe('{a: [x y, "true", 3]}');
    expect(readBlock("---\nprops:\n  a: 1\n  b: [x]\ntitle: T\n---\n", "props")).toEqual({ a: 1, b: ["x"] });
    expect(readBlock("---\nprops: {a: 1}\n---\n", "props")).toEqual({ a: 1 });
  });
});

describe("preview extras", () => {
  it("reads tag schemas and note properties", async () => {
    const schema = parseSchema("tags/paper.yaml", PAPER);
    expect(schema.properties).toEqual([
      { key: "status", type: "select", options: ["Idea", "Drafting"] },
      { key: "deadline", type: "date", options: [] },
    ]);
    expect(schema.views[1]).toEqual({ name: "All", type: "table", sort: [{ key: "deadline", dir: "asc" }] });
    const v = vault();
    expect((await v.tagSchemas()).map((s) => s.name)).toEqual(["paper"]);
    expect((await v.read("library/draft.md")).meta.props).toEqual({ status: "Idea", deadline: "2026-12-01" });
  });

  it("sets properties and tags, and replaces a section", async () => {
    const v = vault();
    const note = await v.updateProps("library/draft.md", { status: "Drafting", venue: "CHI", deadline: null });
    expect(note.text).toContain("props:\n  status: Drafting\n  venue: CHI\n---\n");
    expect(note.meta.props).toEqual({ status: "Drafting", venue: "CHI" });
    const tagged = await v.setTags("library/draft.md", ["#idea"], ["paper"]);
    expect(tagged.meta.tags).toEqual(["idea"]);
    const replaced = await v.replaceSection("library/draft.md", "method", "New method");
    expect(replaced.text).toContain("## Method\n\nNew method\n\n## Results\n");
    await expect(v.replaceSection("library/draft.md", "Nowhere", "x")).rejects.toThrow("No heading");
  });

  it("builds boards and counts links and boards per note", async () => {
    const v = vault();
    const path = await v.createBoard("Plan", null);
    expect(path).toBe("library/plan.canvas");
    const added = await v.addToBoard(path, ["library/draft.md", "library/other.md", "library/draft.md"]);
    expect(added.created).toHaveLength(2);
    expect(added.nodes[0]).toBe(added.nodes[2]);
    await v.connect(path, "Draft", "Other", "leads to");
    await v.group(path, ["Draft", "Other"], "Section");
    const view = await v.board(path);
    expect(view.nodes[0]!.kind).toBe("group");
    expect(view.edges[0]!.label).toBe("leads to");
    expect((await v.boards()).map((b) => b.title)).toEqual(["b", "Plan"]);
    const stats = await v.noteStats();
    expect(stats.find((s) => s.path === "library/draft.md")).toEqual({ path: "library/draft.md", backlinks: 1, links: 0, boards: 2 });
    expect(stats.find((s) => s.path === "library/other.md")?.links).toBe(1);
  });
});
