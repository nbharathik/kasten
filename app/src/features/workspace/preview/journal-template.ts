// Previous journal defaults, matching templated.rs in the core: the empty
// Morning/Notes headings or the untouched Daily Planner body. New days
// leave them out; templates containing the person's writing are used.

import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import dailyJournal from "../../../../../crates/kasten-core/defaults/legacy/daily-journal.md?raw";

export function isOldJournalTemplate(text: string): boolean {
  const { prefix, body } = splitFrontmatter(text.replace(/^\ufeff/, "").replace(/\r\n/g, "\n"));
  const keys = prefix
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "---");
  if (!prefix || !keys.every((line) => line.startsWith("title:") || line.startsWith("type:"))) return false;
  if (body.trim() === splitFrontmatter(dailyJournal.replace(/\r\n/g, "\n")).body.trim()) return true;
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) => /^#{1,6}\s*(morning|notes)$/i.test(line));
}
