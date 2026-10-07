// A saved preview that cannot be read starts the samples afresh rather
// than stopping the app.

import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";
import { readStored } from "./stored";

const SEED = { "library/welcome.md": "---\ntitle: Welcome\n---\nHello\n" };

describe("the preview's saved notes", () => {
  it("reads what it saved, leaving out notes whose text is not text", () => {
    const saved = readStored(JSON.stringify({ files: { "a.md": { text: "A", modified: 1 }, "b.md": { text: 2 }, "c.md": null } }));
    expect(saved).toEqual({ files: { "a.md": { text: "A", modified: 1 } }, trash: {} });
  });

  it("starts from the samples when what was saved cannot be read", async () => {
    for (const broken of ["{not json", "null", "[]", '{"files": 3}']) {
      expect(readStored(broken)).toBeNull();
      const vault = new MemoryVault(SEED, { load: () => broken, save: () => {} });
      expect((await vault.list()).map((n) => n.path)).toEqual(["library/welcome.md"]);
    }
  });
});
