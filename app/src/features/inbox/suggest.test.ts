import { describe, expect, it } from "vitest";

import type { NoteMeta, RelatedNote } from "../../lib/vault/types";
import { suggestHome } from "./suggest";

function note(path: string, extra: Partial<NoteMeta> = {}): NoteMeta {
  return {
    path,
    id: path,
    title: path.split("/").pop()!.replace(".md", ""),
    kind: "card",
    project: null,
    parent: null,
    icon: null,
    cover: null,
    tags: [],
    created: null,
    updated: null,
    modified: 0,
    size: 0,
    excerpt: "",
    words: 0,
    ...extra,
  } as NoteMeta;
}

const similar = (...paths: string[]): RelatedNote[] => paths.map((path) => ({ path, title: path, icon: null, shared: [], linked: false }));

describe("where an inbox note may belong", () => {
  const notes = [
    note("projects/pottery/_project.md", { kind: "project", project: "pottery", title: "Pottery" }),
    note("projects/pottery/cards/kiln.md", { project: "pottery", tags: ["studio", "firing"] }),
    note("projects/pottery/cards/glaze.md", { project: "pottery", tags: ["studio"] }),
    note("projects/garden/cards/beds.md", { project: "garden", tags: ["spring"] }),
    note("library/wheel.md", { tags: ["studio", "firing"] }),
    note("inbox/new.md", { tags: ["firing"] }),
  ];
  const card = notes[5]!;

  it("suggests the project most of its similar notes are in, and their tags", () => {
    const home = suggestHome(card, similar("projects/pottery/cards/kiln.md", "library/wheel.md", "projects/pottery/cards/glaze.md", "projects/garden/cards/beds.md"), notes);
    expect(home.project).toEqual({ folder: "pottery", title: "Pottery", count: 2 });
    // Tags two of them share, not the ones it has already.
    expect(home.tags).toEqual(["studio"]);
  });

  it("suggests nothing from a single note, or notes of the inbox", () => {
    expect(suggestHome(card, similar("projects/garden/cards/beds.md", "library/wheel.md"), notes)).toEqual({ project: null, tags: [] });
    expect(suggestHome(card, [], notes)).toEqual({ project: null, tags: [] });
  });

  it("does not suggest the project it is in already", () => {
    const inPottery = { ...card, project: "pottery" };
    expect(suggestHome(inPottery, similar("projects/pottery/cards/kiln.md", "projects/pottery/cards/glaze.md"), notes).project).toBeNull();
  });
});
