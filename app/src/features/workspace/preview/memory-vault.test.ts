// The preview vault behaves like kasten-core's ops (crates/kasten-core/tests/ops.rs).

import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";
import { contentHash, readableLine, slugify, wikiLinks } from "./vault-text";

const NOW = Date.UTC(2026, 8, 24, 8, 0, 0);
const TEMPLATES = {
  "templates/paper.md": '---\ntitle: "{{title}}"\ntype: page\ntags: [paper]\nprops:\n  status: Idea\n---\n## Introduction\n',
  "templates/journal.md": '---\ntitle: "{{date}}"\ntype: journal\n---\n## Focus for today\n',
};
const vault = (files: Record<string, string> = {}) => new MemoryVault({ ...TEMPLATES, ...files }, undefined, () => NOW);
const page = (title: string, extra = {}) => ({ kind: "page" as const, title, date: "2026-09-24", ...extra });

describe("preview vault", () => {
  it("hashes and slugs like the core", () => {
    expect(contentHash("a")).toBe("af63dc4c8601ec8c");
    expect(slugify("  Über: Straße & Café!  ")).toBe("über-straße-café");
    expect(slugify("a".repeat(200))).toHaveLength(80);
    expect(new TextEncoder().encode(slugify("語".repeat(100))).length).toBe(120);
    expect(wikiLinks("See [[A]], ![[B#x|y]] and \\[[not]]")).toEqual(["A", "B"]);
    // Links in code are code, as the core reads them.
    expect(wikiLinks("`[[Span]]` and [[Real]]\n```\n[[Fenced]]\n```js\n[[Still fenced]]\n````\n[[After]]\n")).toEqual(["Real", "After"]);
    expect(readableLine("- [ ] Type `[[` and link to [[Note-taking study]]")).toBe("Type [[ and link to Note-taking study");
    expect(readableLine("a ``x ` **y**`` b")).toBe("a x ` **y** b");
    expect(readableLine("12. item with `code` and \\[[escaped]]")).toBe("item with code and [[escaped]]");
  });

  it("creates pages, sub-pages, projects and journal days where the core would", async () => {
    const v = vault();
    const first = await v.create(page("Reading list: 2026"));
    expect(first.meta.path).toBe("library/reading-list-2026.md");
    expect(first.text).toContain('title: "Reading list: 2026"\n');
    expect(first.text).toContain("created: 2026-09-24T08:00:00Z\n");
    expect((await v.create(page("Reading list: 2026"))).meta.path).toBe("library/reading-list-2026-2.md");
    const child = await v.create(page("Chapter 1", { parent: first.meta.path }));
    expect(child.meta.parent).toBe(first.meta.id);
    expect((await v.create({ ...page("Study"), kind: "project" })).meta.path).toBe("projects/study/_project.md");
    const inProject = await v.create(page("Draft", { project: "study", template: "paper" }));
    expect(inProject.meta.path).toBe("projects/study/pages/draft.md");
    expect(inProject.meta.tags).toEqual(["paper"]);
    const day = await v.journal("2026-09-24");
    expect(day.meta.path).toBe("journal/2026/2026-09-24.md");
    expect(day.text).toContain("## Focus for today");
  });

  it("saves bodies, skips no-op saves and keeps both versions on conflict", async () => {
    const v = vault({ "library/a.md": "---\ntitle: A\n---\nOld\n" });
    const loaded = await v.read("library/a.md");
    expect((await v.saveBody("library/a.md", "Old\n", loaded.hash)).status).toBe("unchanged");
    const saved = await v.saveBody("library/a.md", "New\n", loaded.hash);
    expect(saved.status).toBe("written");
    expect(saved.note.text).toBe("---\ntitle: A\nupdated: 2026-09-24T08:00:00Z\n---\nNew\n");
    const stale = await v.saveBody("library/a.md", "Mine\n", loaded.hash);
    expect(stale.status).toBe("conflict");
    if (stale.status !== "conflict") return;
    expect(stale.copy).toBe("library/a (conflict 2026-09-24 08-00).md");
    expect((await v.read(stale.copy)).text).toContain("title: A (conflict 2026-09-24 08-00)");
  });

  it("changes header keys, trashes, restores, fills empty pages and finds text", async () => {
    const v = vault({ "library/a.md": "---\ntitle: A\n---\nLinks to [[B]] here\n", "library/b.md": "---\ntitle: B\n---\n" });
    expect((await v.setMeta("library/a.md", "icon", "🚀")).meta.icon).toBe("🚀");
    expect((await v.backlinks("library/b.md")).map((l) => l.snippet)).toEqual(["Links to [[B]] here"]);
    expect((await v.search("links"))[0]?.path).toBe("library/a.md");
    const filled = await v.applyTemplate("library/b.md", "paper", "2026-09-24");
    expect(filled.meta.tags).toEqual(["paper"]);
    expect(filled.text).toContain("props:\n  status: Idea\n");
    await expect(v.applyTemplate("library/b.md", "paper", "2026-09-24")).rejects.toThrow("empty pages");

    const trashed = await v.trash("library/a.md");
    expect(trashed).toBe(".trash/20260924T080000Z/library/a.md");
    expect((await v.list()).some((n) => n.path === "library/a.md")).toBe(false);
    expect((await v.listTrash())[0]?.title).toBe("A");
    expect((await v.restore(trashed)).meta.path).toBe("library/a.md");
  });

  it("keeps its notes in the given storage", async () => {
    let saved: string | null = null;
    const storage = { load: () => saved, save: (data: string) => void (saved = data) };
    const v = new MemoryVault(TEMPLATES, storage, () => NOW);
    await v.create(page("Kept"));
    const reopened = new MemoryVault({}, storage, () => NOW);
    expect((await reopened.list()).map((n) => n.path)).toContain("library/kept.md");
  });

  it("renames a page, moves a file named after it and relinks other notes", async () => {
    const v = vault({ "library/custom.md": "---\ntitle: Kept\n---\nLinks [[Old#Part|here]], ![[old]] and \\[[Old]].\n" });
    const old = await v.create(page("Old"));
    const renamed = await v.rename(old.meta.path, "New name");
    expect(renamed.note.meta.path).toBe("library/new-name.md");
    expect(renamed.note.meta.title).toBe("New name");
    expect(renamed.relinked).toEqual(["library/custom.md"]);
    expect((await v.read("library/custom.md")).text).toBe("---\ntitle: Kept\n---\nLinks [[New name#Part|here]], ![[New name]] and \\[[Old]].\n");
    expect((await v.rename("library/custom.md", "Still here")).note.meta.path).toBe("library/custom.md");
    await expect(v.rename("library/custom.md", "Bad [[title]]")).rejects.toThrow();
    const day = await v.journal("2026-09-24");
    await expect(v.rename(day.meta.path, "Tuesday")).rejects.toThrow(/date/);
  });

  it("moves a page and its sub-pages into a project and back", async () => {
    const v = vault({ "projects/study/_project.md": "---\ntitle: Study\ntype: project\n---\n" });
    const parent = await v.create(page("Plan"));
    await v.create(page("Chapter", { parent: parent.meta.path }));
    const moved = await v.move(parent.meta.path, "study");
    expect(moved.meta.path).toBe("projects/study/pages/plan.md");
    expect((await v.list()).map((n) => n.path)).toContain("projects/study/pages/chapter.md");
    expect((await v.move(moved.meta.path, null)).meta.path).toBe("library/plan.md");
    await expect(v.move("library/plan.md", "nowhere")).rejects.toThrow();
  });

  it("moves a sub-page on its own out from under its parent, as the core does", async () => {
    const v = vault({ "projects/study/_project.md": "---\ntitle: Study\ntype: project\n---\n" });
    const parent = await v.create(page("Plan"));
    const chapter = await v.create(page("Chapter", { parent: parent.meta.path }));
    await v.create(page("Section", { parent: chapter.meta.path }));
    const moved = await v.move(chapter.meta.path, "study");
    expect(moved.meta.path).toBe("projects/study/pages/chapter.md");
    expect(moved.meta.parent ?? null).toBeNull();
    expect(moved.text).toBe(chapter.text.replace(/^parent: .*\n/m, ""));
    // Its own sub-page comes along and stays under it.
    const section = (await v.list()).find((n) => n.title === "Section")!;
    expect(section.path).toBe("projects/study/pages/section.md");
    expect(section.parent).toBe(chapter.meta.id);
  });

  it("duplicates a page beside itself with a new id and title", async () => {
    const v = vault({ "library/plan.md": "---\nid: A\ntitle: Plan\ntags: [x]\n---\nBody\n" });
    const copy = await v.duplicate("library/plan.md");
    expect(copy.meta.path).toBe("library/plan-copy.md");
    expect(copy.meta.title).toBe("Plan (copy)");
    expect(copy.meta.id).not.toBe("A");
    expect(copy.text).toMatch(/^---\nid: \w+\ntitle: Plan \(copy\)\ntags: \[x\]\ncreated: .+\nupdated: .+\n---\nBody\n$/);
    expect((await v.duplicate("library/plan.md")).meta.path).toBe("library/plan-copy-2.md");
  });

  it("creates a note with tags and properties in one go, checked by schema", async () => {
    const v = vault({ "tags/task.yaml": "name: task\nproperties:\n  - {key: status, type: select, options: [Todo, Done]}\n  - {key: due, type: date}\n" });
    const note = await v.create({ kind: "page", title: "Book flights", date: "2026-09-24", tags: ["task"], props: { status: "Todo", due: "2026-10-02" } });
    expect(note.meta.tags).toEqual(["task"]);
    expect(note.meta.props).toEqual({ status: "Todo", due: "2026-10-02" });
    expect(note.text).toContain("tags: [task]");
    await expect(v.create({ kind: "page", title: "Bad", date: "2026-09-24", tags: ["task"], props: { status: "Maybe" } })).rejects.toThrow(/must be one of Todo, Done/);
    // Refused before anything was made.
    expect((await v.list()).some((n) => n.title === "Bad")).toBe(false);
  });

  it("captures a quick card in the inbox with its first line as the title", async () => {
    const v = vault();
    const card = await v.capture("# Call the **venue**\nAbout the date", ["#trip", "work", "Trip"]);
    expect(card.meta.path).toBe("inbox/call-the-venue.md");
    expect(card.meta.title).toBe("Call the venue");
    expect(card.meta.kind).toBe("card");
    expect(card.meta.tags).toEqual(["trip", "work"]);
    // The first line is the title, so the body is the rest.
    expect(card.text.endsWith("---\nAbout the date\n")).toBe(true);
  });

  it("lists to-dos with their days, and mentions that are not links", async () => {
    const v = vault({
      "library/a.md": "---\ntitle: A\n---\n- [ ] Book [[2026-10-01]]\n- [x] Pack @2026-10-02\n- [ ] Plain\n",
      "library/b.md": "---\ntitle: B\n---\nTalks about trip plans and [[A]]\n",
      "library/trip-plans.md": "---\ntitle: Trip plans\n---\n",
      "library/c.md": "---\ntitle: C\n---\nAlready links [[Trip plans]]\n",
    });
    const tasks = await v.tasks();
    expect(tasks.map((t) => [t.text, t.done, t.due])).toEqual([
      ["Book 2026-10-01", false, "2026-10-01"],
      ["Pack @2026-10-02", true, "2026-10-02"],
      ["Plain", false, null],
    ]);
    expect((await v.mentions("Trip plans", "library/trip-plans.md")).map((m) => m.path)).toEqual(["library/b.md"]);
  });

  it("keeps versions, batches quick edits and restores an older one", async () => {
    let now = NOW;
    const v = new MemoryVault({ ...TEMPLATES }, undefined, () => now);
    const made = await v.create(page("Plan"));
    let hash = made.hash;
    for (const body of ["One\n", "Two\n"]) {
      now += 1_000;
      hash = (await v.saveBody(made.meta.path, body, hash)).note.hash;
    }
    now += 60_000;
    await v.saveBody(made.meta.path, "Three\n", hash);
    const history = await v.history(made.meta.path);
    expect(history.map((c) => c.summary)).toEqual(["edit: Plan", "edit: Plan", "create: Plan"]);
    expect(await v.version(history[1]!.id, made.meta.path)).toContain("Two\n");
    const restored = await v.restoreVersion(made.meta.path, history[1]!.id);
    expect(restored.text).toContain("Two\n");
    expect((await v.history(made.meta.path))[0]!.summary).toBe("restore: Plan");
    expect((await v.history(null)).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps settings and reports broken links and duplicate ids", async () => {
    const v = vault({
      "library/a.md": "---\nid: X\ntitle: A\n---\nSee [[Nowhere]] on [[2026-09-24]]\n",
      "library/b.md": "---\nid: X\ntitle: B\n---\n",
    });
    const config = await v.getConfig();
    await v.setConfig({ ...config, name: "Mine" });
    expect((await v.status()).name).toBe("Mine");
    expect((await v.status()).backup.state).toBe("off");
    const report = await v.verify();
    expect(report.problems.map((p) => p.kind).sort()).toEqual(["duplicate-id", "unresolved-link"]);
    await expect(v.pushNow()).rejects.toThrow();
  });

  it("reads a note's to-dos again only when its text or name changed", async () => {
    const v = new MemoryVault({ "library/a.md": "---\ntitle: A\n---\n- [ ] One\n", "library/b.md": "---\ntitle: B\n---\nNo to-dos.\n" });
    expect((await v.tasks()).map((t) => `${t.title}: ${t.text}`)).toEqual(["A: One"]);
    const b = await v.read("library/b.md");
    await v.saveBody("library/b.md", "- [x] Two\n", b.hash);
    expect((await v.tasks()).map((t) => `${t.title}: ${t.text} ${t.done}`).sort()).toEqual(["A: One false", "B: Two true"]);
    await v.rename("library/a.md", "Alpha");
    expect((await v.tasks()).find((t) => t.text === "One")?.title).toBe("Alpha");
  });
});
