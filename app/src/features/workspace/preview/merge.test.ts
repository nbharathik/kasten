import { describe, expect, it } from "vitest";

import { merge3 } from "./merge";

const BASE = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n";

describe("merge3 (as merge.rs)", () => {
  it("keeps edits to different lines", () => {
    const ours = BASE.replace("First", "My first");
    const theirs = BASE.replace("Third", "Their third");
    expect(merge3(BASE, ours, theirs)).toBe("# Title\n\nMy first paragraph.\n\nSecond paragraph.\n\nTheir third paragraph.\n");
  });

  it("keeps additions and removals on both sides", () => {
    const ours = `${BASE}\nAdded at the end.\n`;
    const theirs = BASE.replace("Second paragraph.\n\n", "");
    expect(merge3(BASE, ours, theirs)).toBe("# Title\n\nFirst paragraph.\n\nThird paragraph.\n\nAdded at the end.\n");
    expect(merge3(BASE, ours, ours)).toBe(ours);
    expect(merge3(BASE, BASE, theirs)).toBe(theirs);
  });

  it("refuses overlapping edits and keeps line endings", () => {
    expect(merge3(BASE, BASE.replace("Second", "Our second"), BASE.replace("Second", "Their second"))).toBeNull();
    expect(merge3("a\r\nb\r\nc", "A\r\nb\r\nc", "a\r\nb\r\nC")).toBe("A\r\nb\r\nC");
  });
});
