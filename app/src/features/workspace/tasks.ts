// To-dos across the vault: every `- [ ] task` line in a note's body, and
// ticking one by flipping just that line's box.

export interface Task {
  /** Line number in the body, from 0. */
  line: number;
  done: boolean;
  text: string;
  /** Leading spaces, for nested tasks. */
  depth: number;
}

const TASK = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;

export function tasksIn(body: string): Task[] {
  const out: Task[] = [];
  let fence: string | null = null;
  body.split(/\r?\n/).forEach((line, i) => {
    const open = FENCE.exec(line)?.[1];
    if (open) fence = fence === null ? open : fence === open ? null : fence;
    if (fence !== null || open) return;
    const match = TASK.exec(line);
    if (match) out.push({ line: i, done: match[2] !== " ", text: match[3]!.trim(), depth: Math.floor(match[1]!.replace(/\t/g, "  ").length / 2) });
  });
  return out;
}

/** `body` with the task on `line` ticked or unticked, or null when that
 * line is no longer the same task. Every other byte stays. */
export function setTask(body: string, task: Task, done: boolean): string | null {
  const lines = body.split(/(?<=\n)/);
  const line = lines[task.line];
  if (line === undefined) return null;
  const match = TASK.exec(line.replace(/\r?\n$/, ""));
  if (!match || match[3]!.trim() !== task.text) return null;
  lines[task.line] = line.replace(/\[([ xX])\]/, done ? "[x]" : "[ ]");
  return lines.join("");
}
