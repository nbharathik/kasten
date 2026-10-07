// The lines a code walkthrough looks at, one entry for each step: "1", "2-3",
// "4,6-10". The other lines are dimmed at that step.

const ENTRY = /^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/;

/** The line ranges of an entry, `[first, last]` each; null when it is not a list of lines and ranges, or a range runs backwards, or a line is 0. */
export function rangesOf(entry: string): [number, number][] | null {
  if (!ENTRY.test(entry)) return null;
  const ranges = entry.split(",").map((part): [number, number] => {
    const [from, to] = part.split("-").map((n) => Number(n.trim())) as [number, number | undefined];
    return [from, to ?? from];
  });
  return ranges.every(([from, to]) => from >= 1 && to >= from) ? ranges : null;
}

/** An entry written the way the deck keeps it: no spaces, numbers plain (`" 2 - 3 , 05 "` is `"2-3,5"`); null when it is not an entry. */
export function normalizeFocus(entry: string): string | null {
  const ranges = rangesOf(entry);
  if (!ranges) return null;
  // A part that was a single line stays one; a range stays a range, even of one line.
  const parts = entry.split(",");
  return ranges.map(([from, to], i) => (parts[i]?.includes("-") ? `${from}-${to}` : `${from}`)).join(",");
}

/** The last line an entry names; 0 when it is not an entry. */
export const lastLine = (entry: string): number => Math.max(0, ...(rangesOf(entry) ?? []).map(([, to]) => to));

/** Whether an entry names a line the code does not have. */
export const pastEnd = (entry: string, lines: number): boolean => lastLine(entry) > lines;

/** What a new entry starts as: the line after the last one looked at, or the first line. */
export function nextFocus(entries: readonly string[], lines: number): string {
  const after = lastLine(entries.at(-1) ?? "") + 1;
  return after > 1 && after <= lines ? String(after) : "1";
}

/** How many lines a piece of code has. */
export const linesOf = (code: string): number => (code === "" ? 0 : code.replace(/\n$/, "").split("\n").length);
