import { describe, expect, it } from "vitest";

import { coverBackground, isPictureCover } from "./covers";

describe("page covers", () => {
  it("shows presets, and pictures kept with the vault through the page's files", () => {
    expect(coverBackground("")).toBeNull();
    expect(coverBackground("gradient-dawn")).toContain("linear-gradient");
    expect(isPictureCover("../assets/2026/seaside.jpg")).toBe(true);
    expect(isPictureCover("https://example.com/a.png")).toBe(false);
    const url = (src: string) => `asset://vault/${src.replace("../", "")}`;
    expect(coverBackground("../assets/2026/seaside.jpg", url)).toBe('center / cover no-repeat url("asset://vault/assets/2026/seaside.jpg")');
    // Without a way to load it, or for a value it does not know, a plain band.
    expect(coverBackground("../assets/2026/seaside.jpg")).toBe("var(--notion-gray-bg)");
    expect(coverBackground("something-else", url)).toBe("var(--notion-gray-bg)");
  });
});
