// A new page is a draft until its first input, which makes it once, with
// that input, and every call after goes to the page it became.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VaultClient } from "../../lib/vault/types";
import { DRAFT_HASH, isDraft, madeOf, newDraft } from "./drafts";
import { MemoryVault } from "./preview/memory-vault";
import { withDrafts } from "./with-drafts";

const SEED = {
  "library/a.md": "---\ntitle: A\n---\nLinks to nothing yet.\n",
  "projects/trip/_project.md": "---\ntitle: Trip\ntype: project\n---\n",
  "templates/meeting.md": "---\ntitle: \"{{title}}\"\n---\n## Agenda\n",
};

let vault: MemoryVault;
let client: VaultClient;
let made: [string, string][];

beforeEach(() => {
  vault = new MemoryVault(SEED);
  made = [];
  client = withDrafts(vault, { onMade: (draft, note) => made.push([draft, note.meta.path]), today: () => "2026-09-28" });
});

const paths = async () => (await vault.list()).map((n) => n.path).sort();

describe("drafts", () => {
  it("answer as an empty page and make nothing until written in", async () => {
    const before = await paths();
    const create = vi.spyOn(vault, "create");
    const draft = newDraft({ kind: "page", title: "" });
    expect(isDraft(draft)).toBe(true);
    expect((await client.read(draft)).text).toBe("");
    expect(await client.backlinks(draft)).toEqual([]);
    expect(await client.history(draft)).toEqual([]);
    expect(await client.version("HEAD", draft)).toBeNull();
    expect((await client.notesAt([draft, "library/a.md"])).map((n) => n.path)).toEqual(["library/a.md"]);
    expect(await client.trash(draft)).toBe("");
    expect(create).not.toHaveBeenCalled();
    expect(await paths()).toEqual(before);
    expect(made).toEqual([]);
  });

  it("make the page with its first typing, once, and go there after", async () => {
    const create = vi.spyOn(vault, "create");
    const draft = newDraft({ kind: "page", title: "" });
    const first = await client.saveBody(draft, "First thought", DRAFT_HASH);
    expect(first.status).toBe("written");
    const page = first.note.meta.path;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({ kind: "page", body: "First thought", date: "2026-09-28" });
    expect(made).toEqual([[draft, page]]);
    expect(madeOf(draft)?.meta.path).toBe(page);

    await client.saveBody(draft, "First thought, and more", first.note.hash);
    expect((await vault.read(page)).text).toContain("First thought, and more");
    expect((await client.read(draft)).meta.path).toBe(page);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("take a title, an icon or a template as the first input", async () => {
    const create = vi.spyOn(vault, "create");
    const titled = newDraft({ kind: "page", title: "" });
    const renamed = await client.rename(titled, "Garden plans");
    expect(renamed.note.meta.title).toBe("Garden plans");
    const iconed = newDraft({ kind: "page", title: "" });
    expect((await client.setMeta(iconed, "icon", "🌱")).meta.icon).toBe("🌱");
    const templated = newDraft({ kind: "page", title: "" });
    expect((await client.applyTemplate(templated, "meeting", "2026-09-28")).text).toContain("## Agenda");
    expect(create).toHaveBeenCalledTimes(3);
    expect(made.map(([d]) => d)).toEqual([titled, iconed, templated]);
  });

  it("make one page when two inputs arrive together, keeping both", async () => {
    const before = (await paths()).length;
    const draft = newDraft({ kind: "page", title: "" });
    await Promise.all([client.rename(draft, "Trip notes"), client.saveBody(draft, "Pack light", DRAFT_HASH)]);
    expect((await paths()).length).toBe(before + 1);
    const page = await vault.read(madeOf(draft)!.meta.path);
    expect(page.meta.title).toBe("Trip notes");
    expect(page.text).toContain("Pack light");
  });

  it("make the page where the draft was asked for", async () => {
    const inProject = newDraft({ kind: "page", title: "", project: "trip" });
    expect((await client.rename(inProject, "Packing")).note.meta.path).toMatch(/^projects\/trip\/pages\//);
    const moved = newDraft({ kind: "page", title: "" });
    expect((await client.move(moved, "trip")).meta.path).toMatch(/^projects\/trip\/pages\//);
  });
});

describe("what a client adds of its own", () => {
  it("passes through, so the preview's agent stand-ins still reach its vault", async () => {
    const extra = client as unknown as Partial<Pick<MemoryVault, "agentCreate" | "brainstorm" | "saveChat">>;
    expect(typeof extra.agentCreate).toBe("function");
    expect(typeof extra.brainstorm).toBe("function");
    expect(typeof extra.saveChat).toBe("function");
    const note = await extra.agentCreate!({ session: "s1", client: "chat" }, { kind: "card", title: "Hotel ideas", date: "2026-09-28" }, "Near the station.\n");
    expect((await vault.sessions()).map((s) => s.id)).toEqual(["s1"]);
    expect(await paths()).toContain(note.meta.path);
  });
});
