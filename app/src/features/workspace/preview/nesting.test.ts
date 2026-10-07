// Pages inside pages in the preview vault, as kasten-core's nest_note has them.

import { describe, expect, it } from "vitest";

import type { NewNote } from "../../../lib/vault/types";
import { MemoryVault } from "./memory-vault";

const SEED = { "projects/trip/_project.md": "---\ntitle: Trip\ntype: project\n---\n" };
const page = (title: string, extra: Partial<NewNote> = {}): NewNote => ({ kind: "page", title, date: "2026-09-24", ...extra });

describe("pages inside pages, in the preview", () => {
  it("puts a page inside another, moving it there with its sub-pages, and takes it out again", async () => {
    const v = new MemoryVault(SEED);
    const outer = await v.create(page("Route", { project: "trip" }));
    const ideas = await v.create(page("Ideas"));
    await v.create(page("Idea one", { parent: ideas.meta.path }));
    const nested = await v.nest(ideas.meta.path, outer.meta.path);
    expect(nested.meta.path).toBe("projects/trip/pages/ideas.md");
    expect(nested.meta.parent).toBe(outer.meta.id);
    const one = (await v.list()).find((n) => n.title === "Idea one")!;
    expect(one.path).toBe("projects/trip/pages/idea-one.md");
    expect(one.parent).toBe(ideas.meta.id);

    const out = await v.nest(nested.meta.path, null);
    expect(out.meta.parent ?? null).toBeNull();
    expect(out.meta.path).toBe(nested.meta.path);
  });

  it("refuses a page inside itself, its own sub-page, or anything but a page", async () => {
    const v = new MemoryVault(SEED);
    const outer = await v.create(page("Outer"));
    const inner = await v.create(page("Inner", { parent: outer.meta.path }));
    await expect(v.nest(outer.meta.path, outer.meta.path)).rejects.toThrow(/itself/);
    await expect(v.nest(outer.meta.path, inner.meta.path)).rejects.toThrow(/itself/);
    await expect(v.nest(inner.meta.path, "projects/trip/_project.md")).rejects.toThrow(/Only a page/);
    await expect(v.nest("projects/trip/_project.md", outer.meta.path)).rejects.toThrow(/cannot go inside/);
  });
});
