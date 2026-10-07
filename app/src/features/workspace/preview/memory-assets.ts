// The browser preview's pictures: kept in memory for the session and described
// as the core describes them (crates/kasten-core/src/engine/asset_*.rs). The
// same bytes anywhere in assets/ are one asset; each remembers where it came
// from, who added it, its size, tags, a caption and a citation key; and where
// one is used is worked out by looking, never stored.

import type { AddedAsset, AssetEdit, AssetInfo, AssetUsage, ClipRect, DeckUse, NewAsset } from "../../../lib/vault/asset-types";
import { resolveLink } from "../../../lib/vault/assets";
import { keepFileUrl } from "../../../lib/vault/file-url";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { type Fence, fenceAfter } from "../links";
import { assetName, isPicture, typeOf } from "./assets";
import { deckHead } from "./memory-decks";
import { pictureSize } from "./picture-size";
import { sha256Hex } from "./sha256";
import type { Stored as PreviewData } from "./stored";
import { newId } from "./vault-text";

interface Stored {
  bytes: Uint8Array;
  info: AssetInfo;
}

/** A note, board or deck the vault holds, for looking at what it shows. */
export interface Document {
  path: string;
  title: string;
  text: string;
}

const invalid = (why: string) => new Error(why);

/** Tags as the core keeps them (slides-assets clean.rs): tidied, without repeats. */
export function cleanTags(given: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of given) {
    const tag = raw.trim().replace(/^#+/, "").split(/\s+/).filter(Boolean).join(" ");
    if (!tag) continue;
    if ([...tag].length > 60) throw invalid("A tag is at most 60 characters");
    if (!out.some((kept) => kept.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  if (out.length > 32) throw invalid("A picture has at most 32 tags");
  return out;
}

function cleanCaption(given: string): string | null {
  const text = given.trim();
  if ([...text].length > 2000) throw invalid("A caption is at most 2000 characters");
  return text || null;
}

function cleanKey(given: string): string | null {
  const key = given.trim();
  if ([...key].length > 128) throw invalid("A citation key is at most 128 characters");
  if (/[\s,{}"\\]/.test(key)) throw invalid("A citation key has no spaces, commas, braces, quotes or backslashes");
  return key || null;
}

/** The pictures a note shows: paths in the vault, and file names to look for (`![[name.png]]`). */
export function imageRefs(from: string, text: string): { paths: string[]; names: string[] } {
  const paths = new Set<string>();
  const names = new Set<string>();
  let fence: Fence | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const [after, marker] = fenceAfter(fence, raw);
    fence = after;
    if (marker || fence) continue;
    const line = raw.replace(/`[^`]*`/g, " ");
    const add = (dest: string | undefined) => {
      const path = dest === undefined ? null : resolveLink(from, dest);
      if (path) paths.add(path);
    };
    for (const m of line.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]*)>|([^\s)]+))(?=[^)]*\))/g)) add(m[1] ?? m[2]);
    for (const m of line.matchAll(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) add(m[1] ?? m[2] ?? m[3]);
    for (const m of line.matchAll(/!\[\[([^\]|#]+)/g)) {
      const target = m[1]!.trim();
      if (!isPicture(target)) continue;
      if (target.includes("/")) add(`/${target}`);
      else names.add(target.toLowerCase());
    }
  }
  return { paths: [...paths], names: [...names] };
}

/** The pictures a deck uses, by slide id, and those of its theme (deck/head.rs, uses.rs). */
export function deckImages(text: string): { slides: [string, Set<string>][]; theme: Set<string> } | null {
  let deck: unknown;
  try {
    deck = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof deck !== "object" || deck === null || Array.isArray(deck)) return null;
  const collect = (value: unknown, found: Set<string>): void => {
    if (Array.isArray(value)) return value.forEach((item) => collect(item, found));
    if (typeof value !== "object" || value === null) return;
    const fields = value as Record<string, unknown>;
    const named = (key: string) => (typeof fields[key] === "string" && fields[key] !== "" ? (fields[key] as string) : null);
    const path = fields.type === "image" ? named("src") : fields.type === "raw" ? named("preview") : fields.type === "embed" || fields.type === "video" ? named("poster") : null;
    if (path) found.add(path);
    const background = fields.background as { image?: unknown } | undefined;
    if (typeof background?.image === "string" && background.image) found.add(background.image);
    Object.values(fields).forEach((field) => collect(field, found));
  };
  const out = { slides: [] as [string, Set<string>][], theme: new Set<string>() };
  for (const [key, value] of Object.entries(deck)) {
    if (key !== "slides") {
      collect({ [key]: value }, out.theme);
      continue;
    }
    for (const slide of Array.isArray(value) ? value : []) {
      const found = new Set<string>();
      collect(slide, found);
      out.slides.push([String((slide as { id?: unknown })?.id ?? ""), found]);
    }
  }
  return out;
}

const stemOf = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

/** What the preview vault holds, ready to be looked at for "used in". */
export function documentsOf(data: Pick<PreviewData, "files" | "boards" | "decks">, notes: { path: string; title: string }[]): { notes: Document[]; boards: Document[]; decks: Document[] } {
  const titled = (files: Record<string, string> | undefined, title: (text: string) => string | undefined): Document[] =>
    Object.entries(files ?? {}).map(([path, text]) => {
      try {
        return { path, text, title: title(text)?.trim() || stemOf(path) };
      } catch {
        return { path, text, title: stemOf(path) };
      }
    });
  return {
    notes: notes.map((meta) => ({ path: meta.path, title: meta.title, text: splitFrontmatter(data.files[meta.path]?.text ?? "").body })),
    boards: titled(data.boards, (text) => (JSON.parse(text) as { "x-kasten"?: { title?: string } })["x-kasten"]?.title),
    decks: titled(data.decks, (text) => deckHead(text).title ?? undefined),
  };
}

/** Whether `path` names a file in assets/ by its form alone. */
export function isAssetPath(path: string): boolean {
  return path.startsWith("assets/") && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export class MemoryAssets {
  private readonly items = new Map<string, Stored>();

  has(path: string): boolean {
    return this.items.has(path);
  }

  bytesOf(path: string): Uint8Array | undefined {
    return this.items.get(path)?.bytes;
  }

  /** Keeps a picture; the same bytes anywhere in assets/ come back as they are. */
  add(name: string, bytes: Uint8Array, meta: NewAsset, by: string, now: number): AddedAsset {
    const { stem, ext } = assetName(name, bytes.length);
    const source = meta.source ?? "file";
    if (source === "agent") throw invalid("Only an agent's pictures have the source agent");
    if (source === "pdf-clip" && !meta.clip) throw invalid("A figure clipped from a paper needs the paper, the page and the rectangle");
    if (source !== "pdf-clip" && meta.clip) throw invalid("Only a figure clipped from a paper has a clip");
    if (meta.clip && (meta.clip.page < 1 || meta.clip.rect.some((n) => !Number.isFinite(n)) || meta.clip.rect[0] === meta.clip.rect[2] || meta.clip.rect[1] === meta.clip.rect[3])) {
      throw invalid("A clip is a page from 1 and a rectangle with some size");
    }
    const tags = cleanTags(meta.tags ?? []);
    const sha256 = sha256Hex(bytes);
    for (const [path, held] of this.items) {
      if (held.info.sha256 === sha256 && path.toLowerCase().endsWith(`.${ext}`)) return { path, created: false, asset: { ...held.info } };
    }
    let path: string;
    for (let n = 1; ; n++) {
      path = `assets/${n === 1 ? stem : `${stem}-${n}`}.${ext}`;
      if (!this.items.has(path)) break;
    }
    const size = pictureSize(bytes);
    const info: AssetInfo = {
      path,
      name: (name.split(/[/\\]/).pop() ?? name).trim().slice(0, 255),
      id: newId(now),
      bytes: bytes.length,
      sha256,
      width: size?.w ?? null,
      height: size?.h ?? null,
      source,
      createdBy: by,
      created: new Date(now).toISOString().replace(/\.\d+Z$/, "Z"),
      added: now,
      tags,
      caption: meta.caption ? cleanCaption(meta.caption) : null,
      citationKey: meta.citationKey ? cleanKey(meta.citationKey) : null,
      clip: meta.clip ? { ...meta.clip, rect: [...meta.clip.rect] as ClipRect } : null,
      deck: source === "pptx-import" ? (meta.deck?.trim() || null) : null,
      paper: meta.clip ? (meta.clip.pdf.split("/").pop() ?? "").replace(/\.pdf$/i, "") : null,
      described: true,
    };
    this.items.set(path, { bytes, info });
    try {
      keepFileUrl(path, URL.createObjectURL(new Blob([bytes as BlobPart], { type: typeOf(path) })));
    } catch {
      // Kept, but shown as a missing picture.
    }
    return { path, created: true, asset: { ...info } };
  }

  /** The pictures, newest first. */
  list(): AssetInfo[] {
    return [...this.items.values()].map((held) => ({ ...held.info })).filter((info) => isPicture(info.path)).sort((a, b) => b.added - a.added || a.path.localeCompare(b.path));
  }

  get(path: string): AssetInfo {
    const held = this.items.get(path);
    if (!held || !isPicture(path)) throw new Error(`There is no picture at ${path}`);
    return { ...held.info };
  }

  /** Tags replaced; a caption or key set, or cleared when empty. */
  setMeta(path: string, edit: AssetEdit): AssetInfo {
    const held = this.items.get(path);
    if (!held || !isPicture(path)) throw new Error(`There is no picture at ${path}`);
    const next = { ...held.info };
    if (edit.tags) next.tags = cleanTags(edit.tags);
    if (edit.caption !== undefined) next.caption = cleanCaption(edit.caption);
    if (edit.citationKey !== undefined) next.citationKey = cleanKey(edit.citationKey);
    held.info = next;
    return { ...next };
  }

  /** The use of every picture that is used, from one look at what the vault holds. */
  usage(notes: Document[], boards: Document[], decks: Document[]): Record<string, AssetUsage> {
    const out: Record<string, AssetUsage> = {};
    const of = (path: string): AssetUsage => (out[path] ??= { notes: [], boards: [], decks: [] });
    const byName = new Map<string, string[]>();
    for (const path of this.items.keys()) {
      const name = path.split("/").pop()!.toLowerCase();
      byName.set(name, [...(byName.get(name) ?? []), path]);
    }
    for (const note of notes) {
      const refs = imageRefs(note.path, note.text);
      const shown = new Set([...refs.paths, ...refs.names.flatMap((name) => byName.get(name) ?? [])]);
      for (const path of shown) if (path.startsWith("assets/")) of(path).notes.push({ path: note.path, title: note.title });
    }
    for (const board of boards) {
      let nodes: unknown;
      try {
        nodes = (JSON.parse(board.text) as { nodes?: unknown }).nodes;
      } catch {
        continue;
      }
      const shown = new Set<string>();
      for (const node of Array.isArray(nodes) ? (nodes as { type?: string; file?: unknown }[]) : []) if (node.type === "file" && typeof node.file === "string" && node.file.startsWith("assets/")) shown.add(node.file);
      for (const path of shown) of(path).boards.push({ path: board.path, title: board.title });
    }
    for (const deck of decks) {
      const images = deckImages(deck.text);
      if (!images) continue;
      const used = new Map<string, DeckUse>();
      const entry = (path: string) => used.get(path) ?? (used.set(path, { path: deck.path, title: deck.title, slides: [], theme: false }), used.get(path)!);
      images.slides.forEach(([id, paths], at) => paths.forEach((path) => path.startsWith("assets/") && entry(path).slides.push({ number: at + 1, id })));
      images.theme.forEach((path) => path.startsWith("assets/") && (entry(path).theme = true));
      for (const [path, use] of used) of(path).decks.push(use);
    }
    for (const usage of Object.values(out)) {
      usage.notes.sort((a, b) => a.path.localeCompare(b.path));
      usage.boards.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.path.localeCompare(b.path));
      usage.decks.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.path.localeCompare(b.path));
    }
    return out;
  }
}
