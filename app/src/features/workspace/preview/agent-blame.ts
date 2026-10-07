// The preview's agent marks (the core's marks/blame.rs, from git history):
// the lines of a note's body an agent wrote that no person has edited or
// accepted since, in runs of one version, found from the note's versions.
// A person's change settles the agent lines of every paragraph it touches.

import type { AgentMark } from "../../../lib/vault/types";
import { alignSequences } from "../../pages/markdown/align";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import type { Version } from "./stored";

type Stamp = Omit<AgentMark, "start" | "end">;

const blank = (line: string) => line.trim() === "";

/** A note's body lines, as Rust's `str::lines` gives them. */
function linesOf(text: string): string[] {
  const lines = splitFrontmatter(text).body.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** Each line's paragraph (a run of lines that are not blank), and how many there are. */
function paragraphs(lines: readonly string[]): [(number | null)[], number] {
  let count = 0;
  let open = false;
  const of = lines.map((line) => {
    if (blank(line)) {
      open = false;
      return null;
    }
    if (!open) count++;
    open = true;
    return count - 1;
  });
  return [of, count];
}

/** Which lines of `now` sit in a paragraph the change from `then` touched:
 * one with a line added or changed, or one that lost a line. `kept` gives
 * each line of `now` its line in `then`, or -1. */
function touched(now: readonly string[], then: readonly string[], kept: readonly number[]): boolean[] {
  const [paraNow, countNow] = paragraphs(now);
  const [paraThen, countThen] = paragraphs(then);
  const hit = new Array<boolean>(countNow).fill(false);
  const from = new Array<number>(then.length).fill(-1);
  kept.forEach((j, i) => {
    if (j >= 0) from[j] = i;
    else if (paraNow[i] !== null) hit[paraNow[i]!] = true;
  });
  const lost = new Array<boolean>(countThen).fill(false);
  paraThen.forEach((p, j) => {
    if (p !== null && from[j]! < 0) lost[p] = true;
  });
  paraThen.forEach((p, j) => {
    const q = from[j]! >= 0 ? paraNow[from[j]!] : null;
    if (p !== null && lost[p] && q !== null && q !== undefined) hit[q] = true;
  });
  return paraNow.map((p) => p !== null && hit[p]!);
}

/** Marks from each line's stamp, in runs of one version; blank lines never
 * start or end a run. */
function runs(lines: readonly string[], stamps: readonly (Stamp | null)[]): AgentMark[] {
  const out: AgentMark[] = [];
  let open = false;
  lines.forEach((line, k) => {
    if (blank(line)) return;
    const stamp = stamps[k];
    const last = out.at(-1);
    if (stamp && last && open && last.commit === stamp.commit) last.end = k + 1;
    else if (stamp) {
      out.push({ ...stamp, start: k, end: k + 1 });
      open = true;
    } else open = false;
  });
  return out;
}

/** The agent marks of a note from its versions, oldest first. An accepting
 * version (`accept: …`) settles every line; lines older than the versions
 * kept count as a person's. */
export function blame(versions: readonly Version[]): AgentMark[] {
  let lines: string[] = [];
  let owners: (Stamp | null)[] = [];
  for (const version of versions) {
    if (version.text === null) {
      [lines, owners] = [[], []];
      continue;
    }
    const now = linesOf(version.text);
    if (version.summary.startsWith("accept:")) {
      [lines, owners] = [now, now.map(() => null)];
      continue;
    }
    const kept = alignSequences(now, lines, (a, b) => a === b);
    const stamp: Stamp | null = version.session ? { session: version.session, client: version.client ?? "agent", commit: version.id, time: version.time } : null;
    const next = now.map((_, i) => (kept[i]! >= 0 ? (owners[kept[i]!] ?? null) : stamp));
    if (!stamp) touched(now, lines, kept).forEach((hit, i) => hit && (next[i] = null));
    [lines, owners] = [now, next];
  }
  return runs(lines, owners);
}
