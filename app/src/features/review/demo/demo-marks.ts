// The demo's agent writing (dev only): what session A wrote into three
// notes, so the preview shows agent marks. Inside the app the core finds
// them in git history instead.

import type { AgentMark } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { ROADMAP, SKETCH } from "./samples";

export const IDEA = "inbox/idea-album-heat-map.md";
export const IDEA_TEXT = '---\ntitle: "Idea: album heat map"\n---\nColour each album by how many duplicates it holds.\n';
export const NEXT_STEPS = "\n## Next steps\n\n- Cache thumbnails per album.\n- Report the duplicate score per folder.\n";
export const SKETCH_MORE = "\nWeight each pair by file size, so a large duplicate counts for more than a small one.\n";

/** The notes as session A left them. */
export function withAgentWriting(seed: Record<string, string>): Record<string, string> {
  return { ...seed, [IDEA]: IDEA_TEXT, [ROADMAP]: (seed[ROADMAP] ?? "") + NEXT_STEPS, [SKETCH]: (seed[SKETCH] ?? "") + SKETCH_MORE };
}

/** Text an agent wrote into a note, and the commit it came in. */
export interface Writing {
  path: string;
  text: string;
  mark: Omit<AgentMark, "start" | "end">;
}

/** The written lines still in `note` as they were written, as one mark:
 * from the first of them to the last before any the person changed. */
export function marksIn(writing: Writing, note: string): AgentMark[] {
  const body = splitFrontmatter(note).body.split(/\r?\n/);
  const wrote = splitFrontmatter(writing.text).body.trim().split("\n");
  const start = body.indexOf(wrote[0]!);
  if (start < 0) return [];
  let end = start;
  while (end - start < wrote.length && body[end] === wrote[end - start]) end++;
  while (end > start && !body[end - 1]!.trim()) end--;
  return end > start ? [{ start, end, ...writing.mark }] : [];
}
