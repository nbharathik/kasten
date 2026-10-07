// Where a quick capture goes: the Inbox, today's journal, or a project,
// cycled with Tab. Inbox comes first, as the place for anything unsorted.

export type Target = { kind: "inbox" } | { kind: "journal" } | { kind: "project"; slug: string; title: string };

export const INBOX: Target = { kind: "inbox" };
export const JOURNAL: Target = { kind: "journal" };

/** Every place, projects by title. */
export function targetsWith(projects: readonly { slug: string; title: string }[]): Target[] {
  const sorted = [...projects].sort((a, b) => a.title.localeCompare(b.title));
  return [INBOX, JOURNAL, ...sorted.map((p) => ({ kind: "project" as const, slug: p.slug, title: p.title }))];
}

const same = (a: Target, b: Target) => a.kind === b.kind && (a.kind !== "project" || (b.kind === "project" && a.slug === b.slug));

/** The place after `current`, or before it with `back`, going round. */
export function nextTarget(targets: readonly Target[], current: Target, back = false): Target {
  if (targets.length === 0) return INBOX;
  const at = targets.findIndex((t) => same(t, current));
  const step = back ? -1 : 1;
  const next = at < 0 ? 0 : (at + step + targets.length) % targets.length;
  return targets[next]!;
}

/** The place in words. */
export function placeName(target: Target): string {
  switch (target.kind) {
    case "inbox":
      return "Inbox";
    case "journal":
      return "Today's journal";
    case "project":
      return target.title;
  }
}

/** A capture's title: its first line, without Markdown's marks. */
export function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.replace(/^[#>*\-\s[\]x]+/i, "").trim().slice(0, 80);
}
