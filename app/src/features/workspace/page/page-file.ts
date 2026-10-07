// A page taken out of Kasten: copied as Markdown to paste elsewhere, or
// shown in the computer's file manager beside its folder.

import { revealInFolder } from "../../../lib/api";
import type { NoteMeta } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { titleOf } from "../names";
import { useWorkspace } from "../store";
import { flushOpenPage } from "./open-page";

/** The page as Markdown for somewhere else: its title as a heading, then
 * its body, without the frontmatter Kasten keeps. */
export function markdownToCopy(title: string, text: string): string {
  const body = splitFrontmatter(text).body.replace(/^\s*\n/, "").trimEnd();
  if (/^#\s/.test(body) || !title.trim()) return `${body}\n`;
  return body ? `# ${title.trim()}\n\n${body}\n` : `# ${title.trim()}\n`;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Copies the page, with what was typed a moment ago, as Markdown. */
export async function copyAsMarkdown(note: NoteMeta): Promise<void> {
  const { client, toast } = useWorkspace.getState();
  if (!client) return;
  try {
    await flushOpenPage();
    const file = await client.read(note.path);
    await navigator.clipboard.writeText(markdownToCopy(titleOf(note), file.text));
    toast("Copied the page as Markdown");
  } catch (err) {
    toast(message(err));
  }
}

/** Shows the page's file in its folder, or with no page the vault's folder. */
export async function showInFolder(path?: string): Promise<void> {
  try {
    await revealInFolder(path);
  } catch (err) {
    useWorkspace.getState().toast(message(err));
  }
}
