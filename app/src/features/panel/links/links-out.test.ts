import { describe, expect, it } from "vitest";

import type { NoteMeta } from "../../../lib/vault/types";
import { linksOut } from "./links-out";

const note = (path: string, title: string, project: string | null = null) => ({ path, title, project, kind: "page" }) as unknown as NoteMeta;

const NOTES = [
  note("library/here.md", "Here"),
  note("library/welcome.md", "Welcome"),
  note("projects/a/pages/plan.md", "Plan", "a"),
  note("projects/b/pages/plan.md", "Plan", "b"),
];

describe("links out of a page", () => {
  it("finds each linked page once, days and missing names, outside code", () => {
    const body = [
      "See [[Welcome]] and [[welcome|the start]].",
      "Next [[Plan]] then [[Nowhere]] on [[2026-10-01]].",
      "`[[In code]]` and ![[board.canvas]] and ![[tags/books.yaml#Reading]].",
      "```",
      "[[Fenced]]",
      "```",
    ].join("\n");
    const out = linksOut(body, NOTES, { path: "library/here.md", project: null });
    expect(out.map((l) => [l.kind, l.target])).toEqual([
      ["page", "Welcome"],
      ["page", "Plan"],
      ["missing", "Nowhere"],
      ["day", "2026-10-01"],
    ]);
    const plan = out[1]!;
    expect(plan.kind === "page" && plan.shared).toBe(2);
  });

  it("finds the nearest of shared titles from inside a project", () => {
    const out = linksOut("[[Plan]]", NOTES, { path: "projects/b/pages/x.md", project: "b" });
    expect(out[0]!.kind === "page" && [out[0]!.note.path, out[0]!.shared]).toEqual(["projects/b/pages/plan.md", 1]);
  });
});
