import { describe, expect, it } from "vitest";

import { freshStart } from "./fresh-start";

function storage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return { map, getItem: (k: string) => map.get(k) ?? null, removeItem: (k: string) => void map.delete(k) };
}

describe("the preview's fresh start", () => {
  it("drops an earlier preview's notes, tabs and recent pages, once", () => {
    const s = storage({ "kasten.preview-vault": "{}", "kasten.layout": "{}", "kasten.recent": "[]", "kasten.prefs": "{}", "kasten.theme": "dark" });
    expect(freshStart(s)).toBe(true);
    expect([...s.map.keys()]).toEqual(["kasten.prefs", "kasten.theme"]);
    expect(freshStart(s)).toBe(false);
  });

  it("leaves a preview on the new samples alone", () => {
    const s = storage({ "kasten.preview-vault.2": "{}", "kasten.layout": "{}" });
    expect(freshStart(s)).toBe(false);
    expect(s.map.size).toBe(2);
  });
});
