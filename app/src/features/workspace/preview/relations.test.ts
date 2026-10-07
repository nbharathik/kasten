// The preview stores relations as the core does: by id, a note picked by
// path given one, and never a guess among notes that share a title.

import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";

const README = "---\ntitle: README\n---\nAbout\n";
const VAULT = {
  "tags/paper.yaml": "name: paper\nproperties:\n  - {key: related, type: relation}\n",
  "library/draft.md": "---\nid: 01DRAFT\ntitle: Draft\ntags: [paper]\n---\nText\n",
  "projects/trip/pages/readme.md": README,
  "projects/study/pages/readme.md": README,
  "templates/blog-post.md": "---\ntitle: Blog post\n---\n",
};

describe("relations in the preview", () => {
  it("stores a note picked by path as its id, giving it one", async () => {
    const v = new MemoryVault(VAULT);
    const note = await v.updateProps("library/draft.md", { related: ["projects/trip/pages/readme"] });
    const chosen = await v.read("projects/trip/pages/readme.md");
    expect(chosen.meta.id).toBeTruthy();
    expect(note.meta.props.related).toEqual([chosen.meta.id]);
    expect((await v.read("projects/study/pages/readme.md")).meta.id).toBeNull();
    // An id is kept as it is.
    const again = await v.updateProps("library/draft.md", { related: [chosen.meta.id, "01DRAFT"] });
    expect(again.meta.props.related).toEqual([chosen.meta.id, "01DRAFT"]);
  });

  it("refuses a shared title, a template and a note not there, and gives no note an id", async () => {
    const v = new MemoryVault(VAULT);
    await expect(v.updateProps("library/draft.md", { related: ["README"] })).rejects.toThrow(/Several notes are called “README”/);
    await expect(v.updateProps("library/draft.md", { related: ["templates/blog-post.md"] })).rejects.toThrow(/No note called/);
    await expect(v.updateProps("library/draft.md", { related: ["projects/trip/pages/readme.md", "Gone"] })).rejects.toThrow(/No note called “Gone”/);
    expect((await v.read("projects/trip/pages/readme.md")).meta.id).toBeNull();
    expect((await v.read("library/draft.md")).meta.props.related).toBeUndefined();
  });

  it("relates a note to itself by path, keeping the id it is given", async () => {
    const v = new MemoryVault({ ...VAULT, "library/draft.md": "---\ntitle: Draft\ntags: [paper]\n---\nText\n" });
    const note = await v.updateProps("library/draft.md", { related: ["library/draft.md"] });
    expect(note.meta.id).toBeTruthy();
    expect(note.meta.props.related).toEqual([note.meta.id]);
  });
});
