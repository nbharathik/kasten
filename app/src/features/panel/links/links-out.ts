// Where a page's own links go, as the index reads them: outside code, one
// row per page linked, and the links that find no page.

import type { NoteMeta } from "../../../lib/vault/types";
import { isDay } from "../../../lib/dates";
import { directoryOf, linkParts, linkSpans, type Place } from "../../workspace/links";

export type LinkOut =
  /** A page the link finds; `shared` counts the pages it could mean. */
  | { kind: "page"; target: string; note: NoteMeta; shared: number }
  /** A journal day, made when it is first written. */
  | { kind: "day"; target: string; note?: NoteMeta }
  /** No page has this name. */
  | { kind: "missing"; target: string };

/** A link to a file of another kind: a board, a view, a picture. */
const otherFile = (target: string) => /\.[a-z0-9]+$/i.test(target) && !/\.md$/i.test(target);

/** The pages and days `body` links to, in the order first linked, and the
 * names that find nothing. */
export function linksOut(body: string, notes: readonly NoteMeta[], from: Place): LinkOut[] {
  const directory = directoryOf(notes);
  const seen = new Set<string>();
  const out: LinkOut[] = [];
  for (const [start, end] of linkSpans(body)) {
    const { target } = linkParts(body.slice(start, end));
    const key = target.toLowerCase();
    if (!target || otherFile(target) || target.includes("#") || seen.has(key)) continue;
    seen.add(key);
    const found = directory.resolve(target, from);
    if (isDay(target)) {
      out.push({ kind: "day", target, note: found && "note" in found ? found.note : undefined });
    } else if (!found) {
      out.push({ kind: "missing", target });
    } else if ("note" in found) {
      if (found.note.path !== from.path) out.push({ kind: "page", target, note: found.note, shared: 1 });
    } else {
      out.push({ kind: "page", target, note: found.choices[0]!, shared: found.choices.length });
    }
  }
  return out;
}
