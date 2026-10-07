import { describe, expect, it } from "vitest";

import { isOldJournalTemplate } from "./journal-template";
import { MemoryVault } from "./memory-vault";
import dailyJournal from "../../../../../crates/kasten-core/defaults/legacy/daily-journal.md?raw";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";

const FRONT = '---\ntitle: "{{date}}"\ntype: journal\n---\n';

describe("the old journal template", () => {
  it("starts blank with an untouched daily planner but preserves edits and existing days", async () => {
    const vault = new MemoryVault({ "templates/journal.md": dailyJournal });
    expect(splitFrontmatter((await vault.journal("2026-10-02")).text).body.trim()).toBe("");
    const written = dailyJournal + "My plans.\n";
    expect(isOldJournalTemplate(written)).toBe(false);
    const own = new MemoryVault({ "templates/journal.md": written });
    expect((await own.journal("2026-10-02")).text).toContain("My plans.");
    const existing = new MemoryVault({ "templates/journal.md": dailyJournal, "journal/2026/2026-10-02.md": written });
    expect((await existing.journal("2026-10-02")).text).toBe(written);
  });
  it("is known however it is spaced, and a written one is not", () => {
    expect(isOldJournalTemplate(`${FRONT}## Morning\n\n## Notes\n`)).toBe(true);
    expect(isOldJournalTemplate(`${FRONT}## Morning\r\n## Notes\r\n\r\n`.replace(/\n/g, "\r\n"))).toBe(true);
    expect(isOldJournalTemplate(`\ufeff${FRONT}\n# Morning\n\n### notes`)).toBe(true);
    expect(isOldJournalTemplate(`${FRONT}## Morning\n- tea\n\n## Notes\n`)).toBe(false);
    expect(isOldJournalTemplate('---\ntitle: "{{date}}"\ntype: journal\ntags: [daily]\n---\n## Morning\n\n## Notes\n')).toBe(false);
    expect(isOldJournalTemplate(FRONT)).toBe(false);
  });

  it("leaves a preview's new days blank", async () => {
    const vault = new MemoryVault({ "templates/journal.md": `${FRONT}## Morning\n\n## Notes\n` });
    const day = await vault.journal("2026-10-01");
    expect(day.text).not.toContain("Morning");
    const own = new MemoryVault({ "templates/journal.md": `${FRONT}## Grateful for\n` });
    expect((await own.journal("2026-10-01")).text).toContain("## Grateful for");
  });
});
