import { describe, expect, it } from "vitest";

import { iconOf, readable, titleOf } from "./names";

describe("names", () => {
  it("shows fresh pages as Untitled and journal days as dates", () => {
    expect(titleOf({ title: "untitled-2", path: "library/untitled-2.md", kind: "page" })).toBe("Untitled");
    expect(titleOf({ title: "Plan", path: "library/untitled.md", kind: "page" })).toBe("Plan");
    expect(titleOf({ title: "2026-09-24", path: "journal/2026/2026-09-24.md", kind: "journal" })).toMatch(/2026/);
    expect(iconOf({ icon: "cube", kind: "project" })).toBe("🧊");
    expect(iconOf({ icon: null, kind: "journal" })).toBe("icon:journal");
    // Pages and cards without their own icon get the app's line icons.
    expect(iconOf({ icon: null, kind: "page" })).toBe("icon:page");
    expect(iconOf({ icon: null, kind: "card" })).toBe("icon:card");
  });

  it("reads Markdown snippets as plain text", () => {
    expect(readable("## Morning - [x] Read the [[Photo organiser roadmap]] - [ ] Draft ![[Diff|the diff]]")).toBe("Morning Read the Photo organiser roadmap Draft the diff");
    expect(readable("> [!tip] Press **Ctrl+K** or `/` <u>now</u>, see [docs](x.md)")).toBe("Press Ctrl+K or / now, see docs");
    expect(readable("Type `[[` and link to [[Note-taking study]]")).toBe("Type [[ and link to Note-taking study");
    expect(readable("Area $\\pi r^2$ costs \\$5")).toBe("Area $\\pi r^2$ costs $5");
    expect(readable("…dmap | Phase | Goal | | --- | --- | | 1 | Import photos |")).toBe("…dmap · Phase · Goal · 1 · Import photos");
    expect(readable("Cards are _atomic_ and *linked*, keep snake_case and 2*3")).toBe("Cards are atomic and linked, keep snake_case and 2*3");
  });
});
