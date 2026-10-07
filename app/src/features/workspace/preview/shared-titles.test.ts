// The preview vault with pages that share a title, as the
// core's shared_titles tests have it.

import { describe, expect, it } from "vitest";

import type { NewNote } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { MemoryVault } from "./memory-vault";

const SEED = {
  "projects/photo/_project.md": "---\ntitle: Photo\ntype: project\n---\n",
  "projects/study/_project.md": "---\ntitle: Study\ntype: project\n---\n",
};

const page = (title: string, project: string | null = null, parent?: string): NewNote => ({
  kind: "page",
  title,
  date: "2026-09-24",
  ...(project ? { project } : {}),
  ...(parent ? { parent } : {}),
});

async function made(v: MemoryVault, note: NewNote, body = ""): Promise<string> {
  const file = await v.create(note);
  if (body) await v.saveBody(file.meta.path, body, file.hash);
  return file.meta.path;
}

const bodyOf = async (v: MemoryVault, path: string) => splitFrontmatter((await v.read(path)).text).body;
const backlinks = async (v: MemoryVault, path: string) => (await v.backlinks(path)).map((b) => b.path).sort();

describe("pages that share a title, in the preview", () => {
  it("counts a page's backlinks by where its links go", async () => {
    const v = new MemoryVault(SEED);
    const photo = await made(v, page("Plan", "photo"));
    const study = await made(v, page("Plan", "study"));
    const near = await made(v, page("Photo notes", "photo"), "See [[Plan]].\n");
    const far = await made(v, page("Study notes", "study"), "See [[plan#Goals]] and [[projects/photo/pages/plan|the photo plan]].\n");
    const loose = await made(v, page("Loose"), "Which [[Plan]]?\n");
    expect(await backlinks(v, photo)).toEqual([far, loose, near].sort());
    expect(await backlinks(v, study)).toEqual([far, loose].sort());
    const stats = await v.noteStats();
    expect(stats.find((s) => s.path === photo)?.backlinks).toBe(3);
    expect(stats.find((s) => s.path === study)?.backlinks).toBe(2);
    const report = await v.verify();
    expect(report.problems.filter((p) => p.path === loose).map((p) => p.kind)).toEqual(["ambiguous-link"]);
  });

  it("lets a page link its namesake sub-page and back", async () => {
    const v = new MemoryVault(SEED);
    const outer = await made(v, page("Test"));
    const inner = await made(v, page("Test", null, outer), "Back up to [[Test]].\n");
    await v.saveBody(outer, "Down to [[Test]].\n", (await v.read(outer)).hash);
    expect(inner).not.toBe(outer);
    expect(await backlinks(v, outer)).toEqual([inner]);
    expect(await backlinks(v, inner)).toEqual([outer]);
  });

  it("keeps links where they went when a page takes a title in use, is renamed or moves", async () => {
    const v = new MemoryVault(SEED);
    const study = await made(v, page("Plan", "study"));
    const linker = await made(v, page("Photo notes", "photo"), "See [[Plan]].\n");
    const photo = await made(v, page("Plan", "photo"));
    expect(await bodyOf(v, linker)).toBe("See [[projects/study/pages/plan|Plan]].\n");
    expect(await backlinks(v, study)).toEqual([linker]);

    const loose = await made(v, page("Loose"), `See [[${photo.replace(/\.md$/, "")}|Plan]].\n`);
    const renamed = await v.rename(photo, "Roadmap");
    expect(await bodyOf(v, loose)).toBe("See [[Roadmap]].\n");
    expect(renamed.relinked).toEqual([loose]);

    const moved = await v.move(study, null);
    expect(await bodyOf(v, linker)).toBe(`See [[Plan]].\n`);
    expect(await backlinks(v, moved.meta.path)).toEqual([linker]);
  });
});
