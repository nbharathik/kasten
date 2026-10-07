// Starter kits in the browser preview behave as the core's do: the same
// kits in the same order, one step, fresh ids, the person's files kept.

import { describe, expect, it } from "vitest";

import { KIT_ORDER } from "./memory-kits";
import { MemoryVault } from "./memory-vault";

const MANIFESTS = import.meta.glob<string>("../../../../../crates/kasten-core/defaults/kits/*/kit.json", { query: "?raw", import: "default", eager: true });
const STOCK = import.meta.glob<string>(["../../../../../crates/kasten-core/defaults/templates/*.md", "../../../../../crates/kasten-core/defaults/tags/*.yaml"], { query: "?raw", import: "default", eager: true });

/** A new vault's starter files, as the preview starts. */
const starters = () => Object.fromEntries(Object.entries(STOCK).map(([key, text]) => [key.slice(key.indexOf("defaults/") + 9), text]));
const idOf = (text: string) => /^id: (\S+)$/m.exec(text)?.[1];

describe("starter kits in the preview", () => {
  it("offers every kit folder, the daily planner first", async () => {
    expect(Object.keys(MANIFESTS)).toHaveLength(KIT_ORDER.length);
    const kits = await new MemoryVault({}).kits();
    expect(kits.map((k) => k.id)).toEqual(["daily-planner", "second-brain", "zettelkasten", "gtd", "student", "research"]);
    expect(kits.map((k) => k.recommended)).toEqual([true, false, false, false, false, false]);
    // As the core lists them: the kit's files, not its manifest.
    expect(kits[0]!.files).toEqual(["library/daily-planner.md", "library/how-to-plan-a-day.md", "tags/task.yaml", "templates/journal.md"]);
  });

  it("adds a kit with fresh ids, keeps journals blank, and runs once only", async () => {
    const vault = new MemoryVault(starters());
    const added = await vault.addKit("daily-planner");
    expect(added.home).toBe("library/daily-planner.md");
    expect(added.written).not.toContain("templates/journal.md");
    expect(added.written).not.toContain("tags/task.yaml");
    const home = (await vault.read("library/daily-planner.md")).text;
    const sub = (await vault.read("library/how-to-plan-a-day.md")).text;
    expect(idOf(home)).toMatch(/^[0-9A-Z]{26}$/);
    expect(sub).toContain(`parent: ${idOf(home)}\n`);
    expect((await vault.read("templates/journal.md")).text).toBe('---\ntitle: "{{date}}"\ntype: journal\n---\n');
    expect((await vault.journal("2026-10-05")).text.split("---").slice(2).join("---").trim()).toBe("");
    await expect(vault.addKit("daily-planner")).rejects.toThrow("already in this vault");
    await expect(vault.addKit("nope")).rejects.toThrow("no starter kit");
  });

  it("keeps the person's own files, and puts boards and schemas where the preview keeps them", async () => {
    const own = "---\ntitle: \"{{date}}\"\ntype: journal\n---\n## Mine\n";
    const vault = new MemoryVault({ ...starters(), "templates/journal.md": own });
    const added = await vault.addKit("zettelkasten");
    expect(added.kept).toEqual(["templates/journal.md"]);
    expect((await vault.read("templates/journal.md")).text).toBe(own);
    expect((await vault.boards()).map((b) => b.path)).toContain("library/idea-map.canvas");
    expect((await vault.tagSchemas()).map((t) => t.name)).toEqual(expect.arrayContaining(["fleeting", "literature", "permanent"]));
  });
});
