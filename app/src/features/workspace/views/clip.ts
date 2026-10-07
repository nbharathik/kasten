// Quick capture of a web address: in the desktop app the page's article is
// kept as an inbox card; when it cannot be, the link is kept instead.

import type { NoteFile } from "../../../lib/vault/types";
import { useWorkspace } from "../store";

/** A pasted web address: with its scheme, or starting with `www.`. */
export function isAddress(text: string): boolean {
  const t = text.trim();
  return !/\s/.test(t) && (/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(t) || /^www\.[^/\s]+\.[a-z]{2,}/i.test(t));
}

/** Keeps the page at `url` in the Inbox, or its link when the page will not come. */
export async function clipOrKeep(url: string): Promise<NoteFile | null> {
  const { client, create, noteChanged, toast } = useWorkspace.getState();
  if (!client) return null;
  try {
    const note = await client.clipUrl(url.trim());
    noteChanged(note.meta);
    toast(`Clipped “${note.meta.title}” to the Inbox`);
    return note;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    const kept = await create({ kind: "card", title: url.trim() }, false);
    toast(`Kept the link: the page could not be clipped (${why})`);
    return kept;
  }
}
