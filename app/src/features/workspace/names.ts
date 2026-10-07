// How notes are named and drawn in lists: titles, icons, template names.

import { iconGlyph } from "../pages/page/emoji";
import { lineIcon } from "../../ui/glyph";
import type { IconName } from "../../ui/icons";
import { isDay, longDay } from "../../lib/dates";
import type { NoteMeta } from "../../lib/vault/types";

const UNTITLED = /^untitled(-\d+)?$/;

/** The title to show; fresh pages read "Untitled", journal days their date. */
export function titleOf(note: Pick<NoteMeta, "title" | "path" | "kind">): string {
  const stem = note.path.slice(note.path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  if (note.title === stem && UNTITLED.test(stem)) return "Untitled";
  if (note.kind === "journal" && isDay(note.title)) return longDay(note.title);
  return note.title || "Untitled";
}

/** The line icon for each kind of note (ui/glyph.ts). */
const KIND_ICONS: Record<string, IconName> = { journal: "journal", project: "folder", card: "card", highlight: "highlight", chat: "chat", template: "template", board: "board" };

/** The line icon a note of this kind shows until it has its own. */
export const kindIcon = (kind: string): string => lineIcon(KIND_ICONS[kind] ?? "page");

/** The icon to show: the note's own emoji, else a line icon for its kind. */
export function iconOf(note: Pick<NoteMeta, "icon" | "kind">): string {
  return (note.icon && iconGlyph(note.icon)) || kindIcon(note.kind);
}

const TEMPLATE_ICONS: Record<string, IconName> = {
  page: "page",
  card: "card",
  paper: "notebook",
  project: "folder",
  meeting: "user",
  reading: "book",
  experiment: "zap",
  journal: "journal",
};

export const templateIcon = (name: string) => lineIcon(TEMPLATE_ICONS[name] ?? "template");

/** "Paper", "Meeting notes" from a template's file name. */
export const templateLabel = (name: string) => (name.charAt(0).toUpperCase() + name.slice(1)).replace(/[-_]/g, " ");

/** Markdown as a reader sees it: no heading or list marks, link brackets,
 * emphasis marks or tags. For snippets in lists and search. */
export function readable(markdown: string): string {
  // Code spans keep their text as is; everything else loses its marks.
  const parts = markdown.split(/(`[^`\n]*`)/);
  return parts
    .map((part, i) => (i % 2 === 1 ? part.slice(1, -1) : tableText(plainPart(part, i === 0))))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Table rows in a snippet as "a · b · c", without the separator row. */
function tableText(text: string): string {
  if (!text.includes("|")) return text;
  return text
    .replace(/\|?(?:\s*:?-{3,}:?\s*\|)+/g, " ")
    .replace(/\s*\|\s*(?:\|\s*)*/g, " · ")
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .replace(/(?:\s*·\s*){2,}/g, " · ");
}

function plainPart(text: string, first: boolean): string {
  const marks = /(^|\s)(?:#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s*(?:\[![a-z]+\]\s*)?)/g;
  return (first ? text.replace(marks, "$1") : text.replace(/(\n\s*)(?:#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/g, "$1"))
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, title: string, alias?: string) => alias ?? title)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|~~|\\(?=[[\]*_#$])/g, "")
    .replace(/(?<![\p{L}\p{N}])[*_](?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])[*_](?![\p{L}\p{N}])/gu, "")
    .replace(/<[^>]+>/g, "");
}
