import { describe, expect, it } from "vitest";

import type { NoteMeta } from "../../../lib/vault/types";
import { newPageHome } from "./new-page-home";

const meta = (kind: NoteMeta["kind"], path: string, project: string | null = null): Pick<NoteMeta, "kind" | "path" | "project"> => ({ kind, path, project });

describe("where a page made from a page's link goes", () => {
  it("is a sub-page of a page or a project", () => {
    expect(newPageHome(meta("page", "library/trip.md"))).toEqual({ parent: "library/trip.md" });
    expect(newPageHome(meta("project", "projects/garden/_project.md", "garden"))).toEqual({ parent: "projects/garden/_project.md" });
  });

  it("is a page of its own from a journal day or a card, in the card's project", () => {
    expect(newPageHome(meta("journal", "journal/2026/2026-09-25.md"))).toEqual({ project: null });
    expect(newPageHome(meta("card", "projects/garden/cards/seeds.md", "garden"))).toEqual({ project: "garden" });
    expect(newPageHome(meta("card", "inbox/idea.md"))).toEqual({ project: null });
  });

  it("is a page of its own when the note is not known", () => {
    expect(newPageHome(undefined)).toEqual({ project: null });
  });
});
