import { describe, expect, it } from "vitest";

import { carriesNotes, readDrop } from "./drop";

/** A dropped file or folder, as the webview hands it over. */
function fileEntry(name: string): FileSystemEntry {
  const file = new File([name], name);
  return { name, isFile: true, isDirectory: false, file: (done: (f: File) => void) => done(file) } as unknown as FileSystemEntry;
}

function folderEntry(name: string, children: FileSystemEntry[]): FileSystemEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      // Entries come in batches, then an empty one.
      const batches = [children.slice(0, 1), children.slice(1), []];
      return { readEntries: (done: (e: FileSystemEntry[]) => void) => done(batches.shift() ?? []) };
    },
  } as unknown as FileSystemEntry;
}

describe("a drop of notes", () => {
  it("reads a folder with its own name, leaving hidden files out", async () => {
    const trip = folderEntry("Trip", [fileEntry("Day one.md"), folderEntry("img", [fileEntry("map.png")]), folderEntry(".obsidian", [fileEntry("app.json")])]);
    const { name, files } = await readDrop([trip]);
    expect(name).toBe("Trip");
    expect(files.map((f) => f.rel)).toEqual(["Day one.md", "img/map.png"]);
  });

  it("names loose files as a group", async () => {
    const { name, files } = await readDrop([fileEntry("One.md"), fileEntry("Two.md")]);
    expect(name).toBe("");
    expect(files.map((f) => f.rel)).toEqual(["One.md", "Two.md"]);
  });

  it("is told apart from a PDF", () => {
    const drop = (names: string[]) => ({ files: names.map((n) => new File([""], n)), items: [] }) as unknown as DataTransfer;
    expect(carriesNotes(drop(["Notes.md"]))).toBe(true);
    expect(carriesNotes(drop(["Paper.pdf"]))).toBe(false);
  });
});
