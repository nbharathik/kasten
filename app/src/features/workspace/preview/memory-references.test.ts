import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";

const PROJECT = "projects/trip/_project.md";

describe("the bibliography in the preview", () => {
  it("is the text of the .bib files the vault started with, one after another in the order of their paths", async () => {
    const vault = new MemoryVault({
      [PROJECT]: "---\ntitle: Trip\n---\n",
      "papers/b.bib": "@article{second, title={B}}",
      "a.bib": "@article{first, title={A}}",
      "papers/deep/c.bib": "@article{third, title={C}}",
    });
    const text = await vault.references();
    expect(text.indexOf("@article{first")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("@article{first")).toBeLessThan(text.indexOf("@article{second"));
    expect(text.indexOf("@article{second")).toBeLessThan(text.indexOf("@article{third"));
  });

  it("leaves out hidden folders and anything that is not a .bib file, and is empty when there is none", async () => {
    const vault = new MemoryVault({
      [PROJECT]: "---\ntitle: Trip\n---\n",
      ".kasten/x.bib": "@article{hidden, title={No}}",
      "notes.bib.txt": "@article{text, title={No}}",
    });
    expect(await vault.references()).toBe("");
  });
});
