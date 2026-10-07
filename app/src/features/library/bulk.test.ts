import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { addTag, addToBoard, cleanTag, moveTo, removeTag, sharedProject, trashAll, type BulkDeps } from "./bulk";

const SEED = {
  "library/welcome.md": "---\nid: W1\ntitle: Welcome\ntags: [idea]\n---\nHello\n",
  "library/child.md": "---\ntitle: Child\nparent: W1\n---\nInside\n",
  "projects/demo/_project.md": "---\ntitle: Demo\ntype: project\n---\nThe project.\n",
  "projects/demo/pages/roadmap.md": "---\ntitle: Roadmap\n---\nPlan\n",
  "inbox/idea.md": "---\ntitle: An idea\n---\nThink\n",
  "journal/2026/2026-09-23.md": "---\ntitle: 2026-09-23\ntype: journal\n---\nDay\n",
  "projects/demo/boards/plan.canvas": '{"nodes":[{"id":"n1","type":"file","file":"inbox/idea.md","x":0,"y":0,"width":320,"height":180}],"edges":[]}',
};

let vault: MemoryVault;
let deps: BulkDeps;
let progress: [number, number][];
const paths = async () => (await vault.list()).map((n) => n.path);

beforeEach(async () => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
  useWorkspace.setState({ place: { view: "home" }, back: [], forward: [], recent: [], toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
  progress = [];
  const store = useWorkspace.getState();
  deps = {
    client: vault,
    notes: () => useWorkspace.getState().notes,
    noteChanged: store.noteChanged,
    refresh: store.refresh,
    move: (path, project) => store.move(path, project, true),
    trash: (path) => store.trash(path, true),
    progress: (done, total) => progress.push([done, total]),
  };
});

describe("addTag", () => {
  it("tags each note through the client, skipping those that have it", async () => {
    const done = await addTag(deps, ["library/welcome.md", "inbox/idea.md", "projects/demo/pages/roadmap.md"], "idea");
    expect(done.text).toBe("Tagged 2 cards #idea (1 already had it)");
    expect((await vault.read("inbox/idea.md")).meta.tags).toEqual(["idea"]);
    expect((await vault.read("projects/demo/pages/roadmap.md")).meta.tags).toEqual(["idea"]);
    // The store's list follows, so the library redraws the chips.
    expect(useWorkspace.getState().notes.find((n) => n.path === "inbox/idea.md")?.tags).toEqual(["idea"]);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    // One Undo takes the tag off the two it went on, and only those.
    await done.undo!();
    expect((await vault.read("inbox/idea.md")).meta.tags).toEqual([]);
    expect((await vault.read("library/welcome.md")).meta.tags).toEqual(["idea"]);
  });

  it("reloads the list once after tagging many notes", async () => {
    for (let i = 0; i < 6; i++) await vault.create({ kind: "card", title: `Extra ${i}`, date: "2026-09-24" });
    await useWorkspace.getState().refresh();
    const changed = vi.fn();
    const refresh = vi.fn(deps.refresh);
    const extras = useWorkspace.getState().notes.filter((n) => n.title.startsWith("Extra")).map((n) => n.path);
    expect((await addTag({ ...deps, noteChanged: changed, refresh }, extras, "later")).text).toBe("Tagged 6 cards #later");
    expect(changed).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(useWorkspace.getState().notes.filter((n) => n.tags.includes("later"))).toHaveLength(6);
  });

  it("goes on past a note that fails", async () => {
    const { text } = await addTag(deps, ["library/gone.md", "inbox/idea.md"], "later");
    expect(text).toMatch(/^Tagged 1 card #later \(1 failed: .*gone/);
    expect((await vault.read("inbox/idea.md")).meta.tags).toEqual(["later"]);
  });
});

describe("removeTag", () => {
  it("takes a tag off the cards that have it, in any case, and Undo puts it back", async () => {
    await vault.setTags("inbox/idea.md", ["Idea"], []);
    await useWorkspace.getState().refresh();
    const done = await removeTag(deps, ["library/welcome.md", "inbox/idea.md", "projects/demo/pages/roadmap.md"], "idea");
    expect(done.text).toBe("Took #idea off 2 cards (1 didn't have it)");
    expect((await vault.read("library/welcome.md")).meta.tags).toEqual([]);
    expect((await vault.read("inbox/idea.md")).meta.tags).toEqual([]);
    await done.undo!();
    expect((await vault.read("library/welcome.md")).meta.tags).toEqual(["idea"]);
    expect((await vault.read("inbox/idea.md")).meta.tags).toEqual(["Idea"]);
  });
});

describe("moveTo", () => {
  it("moves pages and cards, and says what stayed", async () => {
    const { text, undo } = await moveTo(
      deps,
      ["inbox/idea.md", "library/welcome.md", "projects/demo/pages/roadmap.md", "projects/demo/_project.md", "journal/2026/2026-09-23.md"],
      "demo",
      "Demo",
    );
    // The child page goes along with Welcome.
    expect(text).toBe("Moved 2 cards to Demo (1 was there already; 2 journal days or projects can't move)");
    expect(await paths()).toEqual(expect.arrayContaining(["projects/demo/cards/idea.md", "projects/demo/pages/welcome.md", "projects/demo/pages/child.md"]));
    // No notice for each card: one for all, with one Undo that puts them back.
    expect(useWorkspace.getState().toasts).toEqual([]);
    await undo!();
    expect(await paths()).toEqual(expect.arrayContaining(["inbox/idea.md", "library/welcome.md", "library/child.md"]));
  });

  it("moves a page and its selected sub-page once", async () => {
    const { text } = await moveTo(deps, ["library/child.md", "library/welcome.md"], "demo", "Demo");
    expect(text).toBe("Moved 2 cards to Demo");
    expect(progress).toEqual([[1, 1]]);
    expect(await paths()).toContain("projects/demo/pages/child.md");
  });

  it("names one card moved alone", async () => {
    expect((await moveTo(deps, ["projects/demo/pages/roadmap.md"], null, "Pages")).text).toBe("Moved “Roadmap” to Pages");
    expect(await paths()).toContain("library/roadmap.md");
  });
});

describe("addToBoard", () => {
  it("adds the notes in order and counts those already there", async () => {
    const { text } = await addToBoard(deps, ["library/welcome.md", "inbox/idea.md"], { path: "projects/demo/boards/plan.canvas", title: "Plan" });
    expect(text).toBe("Added 1 card to “Plan” (1 was on it already)");
    const board = await vault.board("projects/demo/boards/plan.canvas");
    expect(board.nodes.map((n) => n.file)).toEqual(["inbox/idea.md", "library/welcome.md"]);
  });
});

describe("trashAll", () => {
  it("trashes each note with one notice, and one Undo brings them all back", async () => {
    const { text, undo } = await trashAll(deps, ["inbox/idea.md", "library/child.md"]);
    expect(text).toBe("Moved 2 cards to the trash");
    expect(await paths()).not.toContain("inbox/idea.md");
    expect((await vault.listTrash()).map((t) => t.original).sort()).toEqual(["inbox/idea.md", "library/child.md"]);
    expect(useWorkspace.getState().toasts).toEqual([]);
    await undo!();
    expect(await paths()).toEqual(expect.arrayContaining(["inbox/idea.md", "library/child.md"]));
    expect(useWorkspace.getState().notes.some((n) => n.path === "inbox/idea.md")).toBe(true);
  });

  it("names one note, skips a sub-page gone with its page and counts unknown ones as failed", async () => {
    expect((await trashAll(deps, ["inbox/idea.md"])).text).toBe("Moved “An idea” to the trash");
    expect((await trashAll(deps, ["library/welcome.md", "library/child.md"])).text).toBe("Moved 1 card to the trash");
    expect((await trashAll(deps, ["projects/demo/pages/roadmap.md", "library/gone.md"])).text).toBe("Moved 1 card to the trash (1 failed)");
  });
});

describe("helpers", () => {
  it("reads a tag from what was typed", () => {
    expect(cleanTag(" #Idea ")).toBe("Idea");
    expect(cleanTag("area/work")).toBe("area/work");
    expect(cleanTag("naïve_2")).toBe("naïve_2");
    expect(cleanTag("two words")).toBeNull();
    expect(cleanTag("#")).toBeNull();
    expect(cleanTag("a,b")).toBeNull();
  });

  it("finds the project every note shares", async () => {
    const notes = useWorkspace.getState().notes;
    const pick = (...p: string[]) => notes.filter((n) => p.includes(n.path));
    expect(sharedProject(pick("projects/demo/pages/roadmap.md", "projects/demo/_project.md"))).toBe("demo");
    expect(sharedProject(pick("projects/demo/pages/roadmap.md", "inbox/idea.md"))).toBeNull();
    expect(sharedProject([])).toBeNull();
  });
});
