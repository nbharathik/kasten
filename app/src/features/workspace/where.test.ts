import { afterEach, describe, expect, it } from "vitest";

import { useShell } from "../../lib/store";
import type { NoteMeta } from "../../lib/vault/types";
import { useWorkspace } from "./store";
import { whereIfShared, whereOf } from "./where";

function note(path: string, title: string, extra: Partial<NoteMeta> = {}): NoteMeta {
  const project = /^projects\/([^/]+)\//.exec(path)?.[1] ?? null;
  return { path, id: null, title, kind: path.endsWith("_project.md") ? "project" : "page", icon: null, cover: null, parent: null, project, tags: [], modified: 0, created: null, updated: null, excerpt: "", words: 0, props: {}, locked: false, ...extra };
}

const NOTES = [
  note("projects/trip/_project.md", "Seaside trip"),
  note("projects/trip/pages/test.md", "Test", { id: "T1" }),
  note("projects/trip/pages/test-2.md", "Test", { parent: "T1" }),
  note("projects/trip/pages/plan.md", "Plan"),
  note("projects/trip/pages/plan-2.md", "Plan"),
  note("library/test.md", "Test"),
  note("library/reading.md", "Reading"),
];

afterEach(() => {
  useShell.setState({ paletteOpen: false, paletteQuery: "" });
  useWorkspace.setState({ notes: [] });
});

describe("where a note lives", () => {
  it("names the parent page, the project, or the folder", () => {
    expect(whereOf(NOTES[2]!, NOTES)).toBe("in Test");
    expect(whereOf(NOTES[1]!, NOTES)).toBe("Seaside trip");
    expect(whereOf(NOTES[5]!, NOTES)).toBe("Pages");
  });

  it("is only said for a shared title, with the file when even that is the same", () => {
    expect(whereIfShared(NOTES[6]!, NOTES)).toBeUndefined();
    expect(whereIfShared(NOTES[5]!, NOTES)).toBe("Pages");
    expect(whereIfShared(NOTES[3]!, NOTES)).toBe("Seaside trip · plan.md");
    expect(whereIfShared(NOTES[4]!, NOTES)).toBe("Seaside trip · plan-2.md");
  });

  it("asks through the palette when a title opened from outside a page is shared", async () => {
    useWorkspace.setState({ notes: NOTES });
    await useWorkspace.getState().openTitle("Plan");
    expect(useShell.getState()).toMatchObject({ paletteOpen: true, paletteQuery: "Plan" });
  });
});
