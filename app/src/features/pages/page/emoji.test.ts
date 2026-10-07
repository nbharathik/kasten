import { describe, expect, it } from "vitest";

import { iconGlyph } from "./emoji";

describe("a page's icon", () => {
  it("keeps an emoji, finds one by name, and keeps the app's line icons", () => {
    expect(iconGlyph("👋")).toBe("👋");
    expect(iconGlyph("rocket")).toBe("🚀");
    expect(iconGlyph("icon:project")).toBe("icon:project");
    expect(iconGlyph("  icon:star ")).toBe("icon:star");
  });

  it("falls back to a page for a name it does not know", () => {
    expect(iconGlyph("icon:no-such-icon")).toBe("📄");
    expect(iconGlyph("nonsense")).toBe("📄");
    expect(iconGlyph(" ")).toBe("");
  });
});
