import { describe, expect, it } from "vitest";

import { isImageFile, keptName, relativeLink, resolveLink } from "./assets";

describe("kept files", () => {
  it("names pasted screenshots after when they were pasted", () => {
    const now = new Date(2026, 8, 24, 10, 12, 5);
    expect(keptName({ name: "image.png", type: "image/png" }, now)).toBe("Pasted image 2026-09-24 101205.png");
    expect(keptName({ name: "", type: "image/jpeg" }, now)).toBe("Pasted image 2026-09-24 101205.jpg");
    expect(keptName({ name: "Town map.png", type: "image/png" }, now)).toBe("Town map.png");
  });

  it("tells pictures from other files", () => {
    expect(isImageFile({ name: "a.JPG", type: "" })).toBe(true);
    expect(isImageFile({ name: "", type: "image/png" })).toBe(true);
    expect(isImageFile({ name: "budget.xlsx", type: "application/vnd.ms-excel" })).toBe(false);
    expect(isImageFile({ name: "photo.heic", type: "image/heic" })).toBe(false);
  });
});

describe("relative links", () => {
  it("link from the note's folder", () => {
    expect(relativeLink("plan.md", "assets/x.png")).toBe("assets/x.png");
    expect(relativeLink("projects/trip/plan.md", "assets/x.png")).toBe("../../assets/x.png");
    expect(relativeLink("assets/about.md", "assets/x.png")).toBe("x.png");
  });

  it("resolve back to vault paths", () => {
    expect(resolveLink("projects/trip/plan.md", "../../assets/x.png")).toBe("assets/x.png");
    expect(resolveLink("plan.md", "./assets/a%20b.png")).toBe("assets/a b.png");
    expect(resolveLink("projects/plan.md", "/assets/x.png?v=2")).toBe("assets/x.png");
    expect(resolveLink("plan.md", "../outside.png")).toBeNull();
    for (const web of ["https://example.com/x.png", "data:image/png;base64,AA", "blob:abc", "//cdn/x.png", "#top", ""]) expect(resolveLink("plan.md", web), web).toBeNull();
  });

  it("round-trip", () => {
    for (const [note, file] of [
      ["a/b/c.md", "assets/one.png"],
      ["top.md", "assets/two.pdf"],
      ["assets/in-assets.md", "assets/three.png"],
    ] as const)
      expect(resolveLink(note, relativeLink(note, file))).toBe(file);
  });
});
