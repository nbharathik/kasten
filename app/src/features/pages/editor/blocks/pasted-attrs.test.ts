// What a pasted colour, toggle or callout brings into the page is checked:
// each lands in the page's Markdown or HTML, where nothing else may ride
// along.

import { describe, expect, it } from "vitest";

import { pastedCallout } from "./callout";
import { pastedColor } from "./color";
import { pastedToggle } from "./toggle";

describe("pasted blocks", () => {
  it("take only Notion's colours", () => {
    expect(pastedColor("red")).toBe("red");
    expect(pastedColor('red"><img src=x onerror=alert(1)>')).toBe("gray");
    expect(pastedColor("red; background:url(https://example.com/t)")).toBe("gray");
    expect(pastedColor(null)).toBe("gray");
  });

  it("keep a toggle's summary on one line, and never let it end the toggle", () => {
    expect(pastedToggle({ open: "true", summary: "Plan <b>now</b>" })).toEqual({ open: true, summary: "Plan <b>now</b>" });
    expect(pastedToggle({ summary: "A\nB" }).summary).toBe("A B");
    const escaped = pastedToggle({ summary: "x</summary></details><script>alert(1)</script>" }).summary;
    expect(escaped).not.toMatch(/<\/?(summary|details|script)/i);
    expect(escaped).toContain("&lt;/summary&gt;");
  });

  it("give a callout a header it can hold", () => {
    expect(pastedCallout({ callout: "warning", fold: "-", title: "Mind this" })).toEqual({ kind: "warning", fold: "-", title: "Mind this" });
    expect(pastedCallout({ callout: "note]\n> [!danger", fold: "x", title: "Line one\n# Heading" })).toEqual({
      kind: "note",
      fold: "",
      title: "Line one # Heading",
    });
  });
});
