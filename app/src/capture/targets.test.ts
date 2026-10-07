import { describe, expect, it } from "vitest";

import { firstLine, INBOX, JOURNAL, nextTarget, placeName, targetsWith } from "./targets";

const places = targetsWith([
  { slug: "trip", title: "Trip" },
  { slug: "garden", title: "Garden" },
]);

describe("where a quick capture goes", () => {
  it("starts in the inbox, then the journal, then projects by title", () => {
    expect(places.map(placeName)).toEqual(["Inbox", "Today's journal", "Garden", "Trip"]);
  });

  it("goes round with Tab, and back with Shift+Tab", () => {
    let at = INBOX;
    const seen = [];
    for (let i = 0; i < 5; i++) {
      at = nextTarget(places, at);
      seen.push(placeName(at));
    }
    expect(seen).toEqual(["Today's journal", "Garden", "Trip", "Inbox", "Today's journal"]);
    expect(placeName(nextTarget(places, INBOX, true))).toBe("Trip");
    expect(nextTarget(places, JOURNAL, true)).toEqual(INBOX);
  });

  it("falls back to the inbox when a project is gone", () => {
    expect(nextTarget(places, { kind: "project", slug: "gone", title: "Gone" })).toEqual(INBOX);
    expect(nextTarget([], JOURNAL)).toEqual(INBOX);
  });

  it("names a capture by its first line", () => {
    expect(firstLine("  - [ ] Call the plumber\nabout the sink")).toBe("Call the plumber");
    expect(firstLine("# Idea\nmore")).toBe("Idea");
  });
});
