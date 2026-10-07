// A heading's section of a note, for `![[Title#Heading]]` embeds: the heading
// and what follows it, up to the next heading at the same level or above.
// Fenced code is skipped, so a `#` comment in a code block is not a heading.

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The section under `heading` (matched without regard to case), or null
 * when the note has no such heading. */
export function sectionOf(markdown: string, heading: string): string | null {
  const wanted = heading.trim().toLowerCase();
  const lines = markdown.split(/\r?\n/);
  let fence: string | null = null;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const open = FENCE.exec(line)?.[1];
    if (open && (fence === null || (open[0] === fence[0] && open.length >= fence.length))) {
      fence = fence === null ? open : null;
      continue;
    }
    if (fence !== null) continue;
    const match = HEADING.exec(line);
    if (!match) continue;
    const depth = match[1]!.length;
    if (start >= 0 && depth <= level) return lines.slice(start, i).join("\n").trimEnd();
    if (start < 0 && match[2]!.trim().toLowerCase() === wanted) {
      start = i;
      level = depth;
    }
  }
  return start < 0 ? null : lines.slice(start).join("\n").trimEnd();
}
