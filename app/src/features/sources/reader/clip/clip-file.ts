// A clip as the vault keeps it: a picture in assets/ named for its paper and
// page, that remembers the paper, the page, the box and the paper's citation
// key. The vault does the writing (`addAsset`, one commit with the picture's
// sidecar); this decides the name and the key, and tells the vault what the
// picture is.

import type { AddedAsset, AssetInfo } from "../../../../lib/vault/asset-types";
import type { PdfRect, VaultClient } from "../../../../lib/vault/types";
import type { Work } from "./bib";

/** What a clip is made of. */
export interface ClipToSave {
  /** The paper: its path in sources/. */
  pdf: string;
  /** From 1. */
  page: number;
  /** The box in PDF points from the page's bottom left. */
  rect: PdfRect;
  png: Uint8Array;
  /** The paper's BibTeX key; empty for none. */
  key: string;
  caption: string;
}

/** The longest a citation key is (the vault refuses more). */
const LONGEST_KEY = 128;

/** Why the vault would not keep this key, in words for the person; null when it would (or there is none). */
export function keyProblem(key: string): string | null {
  const text = key.trim();
  if ([...text].length > LONGEST_KEY) return `A citation key is at most ${LONGEST_KEY} characters`;
  if (/[\s,{}"\\]/.test(text)) return "A citation key has no spaces, commas, braces, quotes or backslashes";
  return null;
}

/** The paper's file name as a slug: letters and digits of any script, one dash between the runs of anything else. */
function slug(pdf: string): string {
  const stem = (pdf.split("/").pop() ?? pdf).replace(/\.pdf$/i, "");
  return stem.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "figure";
}

/**
 * The file name of a clip: `<paper>-p<page>-<n>.png`, `n` one more than the highest the page has among the pictures
 * kept. (The vault numbers a name that is taken on its own, so this is for a name that reads well, not for safety.)
 */
export function clipName(pdf: string, page: number, kept: readonly { path: string }[]): string {
  const stem = slug(pdf);
  const head = `assets/${stem}-p${page}-`;
  let highest = 0;
  for (const { path } of kept) {
    const lower = path.toLowerCase();
    if (!lower.startsWith(head) || !lower.endsWith(".png")) continue;
    const n = lower.slice(head.length, -4);
    if (/^\d{1,9}$/.test(n)) highest = Math.max(highest, Number(n));
  }
  return `${stem}-p${page}-${highest + 1}.png`;
}

const letters = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * The key to start the form with: the one the latest clip from the same paper was given, else the key of the work
 * whose title is the paper's, else none.
 */
export function suggestKey(pdf: string, title: string, kept: readonly AssetInfo[], works: readonly Work[]): string {
  const latest = kept.filter((a) => a.clip?.pdf === pdf && a.citationKey).sort((a, b) => b.added - a.added)[0];
  if (latest?.citationKey) return latest.citationKey;
  const name = letters(title);
  return name ? (works.find((w) => letters(w.title) === name)?.key ?? "") : "";
}

/** Keeps the clip. Resolves to the picture; `created` is false when the same picture was kept before. */
export async function saveClip(client: Pick<VaultClient, "assets" | "addAsset">, clip: ClipToSave): Promise<AddedAsset> {
  const name = clipName(clip.pdf, clip.page, await client.assets().catch(() => []));
  const key = clip.key.trim();
  const caption = clip.caption.trim();
  return client.addAsset(name, clip.png, {
    source: "pdf-clip",
    clip: { pdf: clip.pdf, page: clip.page, rect: clip.rect },
    ...(key ? { citationKey: key } : {}),
    ...(caption ? { caption } : {}),
  });
}
