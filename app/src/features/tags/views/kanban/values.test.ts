import { describe, expect, it } from "vitest";

import { addDays } from "../../../../lib/dates";
import type { NoteMeta, PropDef } from "../../../../lib/vault/types";
import { optionSwatch } from "../../../panel/properties/schemas";
import { metaFor } from "../../../workspace/preview/note-meta";
import { MAX_CHIPS, cardChips, dateText, tintOf } from "./values";

const TODAY = "2026-09-24";

const DEFS: PropDef[] = [
  { key: "due", type: "date", options: [] },
  { key: "priority", type: "select", options: ["Low", "Medium", "High"] },
  { key: "labels", type: "multi_select", options: ["bug", "ux"] },
  { key: "points", type: "number", options: [] },
  { key: "urgent", type: "checkbox", options: [] },
  { key: "venue", type: "text", options: [] },
  { key: "repo", type: "url", options: [] },
  { key: "related", type: "relation", options: [] },
];

const withProps = (props: Record<string, unknown>): NoteMeta => ({ ...metaFor("a.md", "---\ntitle: A\ntags: [task]\n---\nA\n", 0), props });

const words = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const said = (days: number) => {
  const text = words.format(days, "day");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

describe("kanban card values", () => {
  it("says near days in words and others briefly, with the year only when it is not this one", () => {
    expect(dateText(TODAY, TODAY)).toBe(said(0));
    expect(dateText(addDays(TODAY, 1), TODAY)).toBe(said(1));
    expect(dateText(addDays(TODAY, -1), TODAY)).toBe(said(-1));
    expect(dateText("2026-10-02", TODAY)).toBe(new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(2026, 9, 2)));
    const nextYear = dateText("2027-01-05", TODAY);
    expect(nextYear).toBe(new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(2027, 0, 5)));
    expect(nextYear).toContain("2027");
  });

  it("shows each property's value as a chip, in schema order, skipping empty ones", () => {
    const chips = cardChips(
      withProps({ due: "2026-10-02", priority: "high", labels: ["ux", "later"], points: 1200, urgent: true, venue: "CHI", repo: "https://www.github.com/kasten/app", related: ["01A", "01B"] }),
      DEFS,
      TODAY,
    );
    expect(chips.map((c) => [c.kind, c.text])).toEqual([
      ["date", dateText("2026-10-02", TODAY)],
      ["select", "High"],
      ["select", "ux"],
      ["select", "later"],
      ["number", `points ${(1200).toLocaleString()}`],
      ["check", "✓ urgent"],
      ["more", "+3"],
    ]);
    expect(chips.length).toBe(MAX_CHIPS + 1);
    expect(chips[1]!.tone).toEqual(optionSwatch("High", ["Low", "Medium", "High"]));
    expect(chips[0]!.title).toMatch(/^due: /);
    expect(chips.at(-1)!.title).toBe("venue: CHI\nrepo: https://www.github.com/kasten/app\nrelated: 2 notes");
    expect(cardChips(withProps({ urgent: false, venue: "  ", labels: [], due: "soon" }), DEFS, TODAY)).toEqual([]);
  });

  it("shortens text and links, and counts related notes", () => {
    const chips = cardChips(withProps({ venue: "A very long venue name that goes on and on", repo: "https://www.github.com/kasten/app", related: ["01A"] }), DEFS, TODAY);
    expect(chips.map((c) => c.text)).toEqual(["A very long venue name that goes…", "github.com", "↔ 1"]);
    expect(chips[0]!.title).toBe("venue: A very long venue name that goes on and on");
    expect(cardChips(withProps({ repo: "not a url" }), DEFS, TODAY)[0]!.text).toBe("not a url");
  });

  it("marks a deadline gone by on an unfinished card", () => {
    const late = (props: Record<string, unknown>) => cardChips(withProps(props), DEFS, TODAY)[0]!.late;
    expect(late({ due: "2026-09-20" })).toBe(true);
    expect(late({ due: TODAY })).toBe(false);
    expect(late({ due: "2026-09-20", status: "Done" })).toBe(false);
    const start: PropDef = { key: "start", type: "date", options: [] };
    expect(cardChips(withProps({ start: "2026-09-20" }), [start], TODAY)[0]!.late).toBe(false);
  });

  it("tints a card by its option's colour, or not at all", () => {
    const priority = DEFS[1]!;
    expect(tintOf(withProps({ priority: "High" }), priority)).toEqual(optionSwatch("High", priority.options));
    expect(tintOf(withProps({ priority: "" }), priority)).toBeNull();
    expect(tintOf(withProps({ priority: "High" }), null)).toBeNull();
  });
});
