// The palette finds PDFs and Settings groups, and offers the searches run
// lately again.

import { beforeEach, describe, expect, it } from "vitest";

import type { SourceInfo } from "../../../lib/vault/types";
import { useWorkspace } from "../store";
import { takeSettingsJump } from "../views/settings/jump";
import { keepSearch, pdfRows, recentSearches, settingsRows } from "./palette-rows";

const PDFS = [
  { path: "sources/primer.pdf", title: "A primer on sleep", highlights: 2, bytes: 10, modified: 1 },
  { path: "sources/notes.pdf", title: "Lecture notes", highlights: 0, bytes: 10, modified: 2 },
] as SourceInfo[];

beforeEach(() => localStorage.clear());

describe("more palette rows", () => {
  it("finds PDFs by title and opens them in the reader", () => {
    expect(pdfRows(PDFS, "sleep").map((r) => [r.label, r.detail])).toEqual([["A primer on sleep", "PDF"]]);
    expect(pdfRows(null, "sleep")).toEqual([]);
    pdfRows(PDFS, "lecture")[0]!.run("here");
    expect(useWorkspace.getState().place).toEqual({ view: "highlights", path: "sources/notes.pdf" });
  });

  it("finds Settings groups, and opens Settings at one", () => {
    expect(settingsRows("ai prov").map((r) => r.label)).toEqual(["AI providers"]);
    expect(settingsRows("settings short").map((r) => r.label)).toEqual(["Keyboard shortcuts"]);
    expect(settingsRows("x")).toEqual([]);
    settingsRows("backup")[0]!.run("here");
    expect(useWorkspace.getState().place.view).toBe("settings");
    expect(takeSettingsJump()).toBe("History and backup");
    expect(takeSettingsJump()).toBeNull();
  });

  it("keeps the last five searches, newest first, once each", () => {
    for (const q of ["one", "two", "three", "two", "four", "five", "six", "  "]) keepSearch(q);
    expect(recentSearches()).toEqual(["six", "five", "four", "two", "three"]);
    localStorage.setItem("kasten.palette.searches", "{broken");
    expect(recentSearches()).toEqual([]);
  });
});
