// The browser preview's sources and highlights (kasten-core's
// engine/sources.rs). PDFs are kept in memory for the session, too big for
// the browser's storage; the sample vault's load when first read. Each
// source's sidecar of highlights is kept with the notes, so highlights and
// their cards survive a reload.

import { writeFlow } from "../../../lib/flow-yaml";
import type { Highlight, HighlightEdit, NewHighlight, SourceHighlights, SourceInfo } from "../../../lib/vault/source-types";
import type { NoteFile } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { setFrontmatterKey } from "../../pages/page/page-meta";
import { sameBytes } from "./assets";
import { cardBody, cardTitle, checkColor, checkNew, isPdf, MAX_SOURCE_BYTES, sidecarOf, sourceName, stemOf } from "./highlight-cards";
import { MemoryAgents } from "./memory-agents";
import { eolOf } from "./memory-notes";
import type { PreviewStorage } from "./stored";
import { newId, stamps } from "./vault-text";

type Item = Record<string, unknown>;
type Doc = Record<string, unknown> & { highlights: Item[] };

const round = (n: number) => Math.round(n * 100) / 100;

/** A highlight from its JSON; null for an entry without an id or page. */
function highlightOf(item: Item): Highlight | null {
  const text = (key: string) => (typeof item[key] === "string" ? (item[key] as string) : null);
  const page = item.page;
  if (!text("id") || typeof page !== "number" || !Number.isInteger(page) || page < 1) return null;
  const rects = Array.isArray(item.rects) ? item.rects.filter((r): r is [number, number, number, number] => Array.isArray(r) && r.length === 4 && r.every((n) => typeof n === "number")) : [];
  return { id: text("id")!, page, rects, text: text("text") ?? "", color: text("color") ?? "yellow", comment: text("comment"), cardId: text("card_id"), created: text("created"), card: null };
}

/** The sidecar in the core's layout: one highlight per line. */
function writeDoc(doc: Doc): string {
  const parts = Object.entries(doc).map(([key, value]) =>
    key === "highlights" && doc.highlights.length > 0 ? `  "highlights": [\n${doc.highlights.map((h) => `    ${JSON.stringify(h)}`).join(",\n")}\n  ]` : `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  return `{\n${parts.join(",\n")}\n}\n`;
}

export class MemorySources extends MemoryAgents {
  private readonly pdfs = new Map<string, Uint8Array>();
  private readonly samples = new Map<string, () => Promise<Uint8Array>>();

  constructor(seed: Record<string, string>, storage?: PreviewStorage, now: () => number = Date.now) {
    super(seed, storage, now);
    // The sample sidecars, for a preview saved before it had any.
    this.data.sidecars ??= Object.fromEntries(Object.entries(seed).filter(([path]) => path.endsWith(".highlights.json")));
  }

  /** A sample PDF, read with `load` when first opened. */
  addSampleSource(path: string, load: () => Promise<Uint8Array>): void {
    this.samples.set(path, load);
  }

  private has(source: string): boolean {
    return this.pdfs.has(source) || this.samples.has(source);
  }

  private doc(source: string): Doc {
    const text = this.data.sidecars?.[sidecarOf(source)];
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : { title: stemOf(source) };
    return { ...parsed, highlights: Array.isArray(parsed.highlights) ? (parsed.highlights as Item[]) : [] };
  }

  private saveDoc(source: string, doc: Doc): void {
    (this.data.sidecars ??= {})[sidecarOf(source)] = writeDoc(doc);
    this.persist();
  }

  private existing(source: string): Doc {
    sidecarOf(source);
    if (!this.has(source)) throw new Error(`No source at ${source}`);
    return this.doc(source);
  }

  private async withCards(list: Highlight[]): Promise<Highlight[]> {
    if (!list.some((h) => h.cardId)) return list;
    const byId = new Map((await this.list()).flatMap((n) => (n.id ? [[n.id, n.path] as const] : [])));
    return list.map((h) => ({ ...h, card: h.cardId ? (byId.get(h.cardId) ?? null) : null }));
  }

  async importSource(name: string, bytes: Uint8Array): Promise<string> {
    const { slug, title } = sourceName(name);
    const shown = (name.split(/[\\/]/).pop() ?? name).trim();
    if (bytes.length === 0) throw new Error(`“${shown}” is empty`);
    if (bytes.length > MAX_SOURCE_BYTES) throw new Error(`“${shown}” is over 100 MB; keep big files outside the vault`);
    if (!isPdf(bytes)) throw new Error(`“${shown}” is not a PDF`);
    for (let n = 1; ; n++) {
      const path = `sources/${n === 1 ? slug : `${slug}-${n}`}.pdf`;
      if (this.has(path)) {
        if (sameBytes(await this.readSource(path), bytes)) return path;
        continue;
      }
      // Its PDF went with an earlier session: the same file, imported again, takes its highlights back.
      const known = this.data.sidecars?.[sidecarOf(path)] !== undefined;
      this.pdfs.set(path, bytes);
      if (!known) this.saveDoc(path, { title, highlights: [] });
      return path;
    }
  }

  async readSource(path: string): Promise<Uint8Array> {
    const kept = this.pdfs.get(path);
    if (kept) return kept;
    const load = this.samples.get(path);
    if (!load) throw new Error(`No source at ${path}`);
    const bytes = await load();
    this.pdfs.set(path, bytes);
    return bytes;
  }

  async sources(): Promise<SourceInfo[]> {
    const paths = [...new Set([...this.pdfs.keys(), ...this.samples.keys()])];
    const infos = paths.map((path) => {
      const doc = this.doc(path);
      const title = typeof doc.title === "string" && doc.title.trim() ? doc.title.trim() : stemOf(path);
      return { path, title, highlights: doc.highlights.filter((h) => highlightOf(h)).length, bytes: this.pdfs.get(path)?.length ?? 0, modified: this.now() };
    });
    const key = (s: SourceInfo) => `${s.title.toLowerCase()}\u0000${s.path.slice(0, -4)}`;
    return infos.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  }

  async highlights(source: string): Promise<Highlight[]> {
    return this.withCards(this.existing(source).highlights.flatMap((item) => highlightOf(item) ?? []));
  }

  async allHighlights(): Promise<SourceHighlights[]> {
    return Promise.all((await this.sources()).map(async (source) => ({ source, highlights: await this.highlights(source.path) })));
  }

  async addHighlight(source: string, h: NewHighlight): Promise<Highlight> {
    checkNew(h);
    const doc = this.existing(source);
    const item: Item = { id: newId(this.now()), page: h.page, rects: h.rects.map((r) => r.map(round)), text: h.text, color: h.color };
    const comment = h.comment?.trim();
    if (comment) item.comment = comment;
    item.created = stamps(this.now()).rfc3339;
    doc.highlights.push(item);
    this.saveDoc(source, doc);
    return highlightOf(item)!;
  }

  async editHighlight(source: string, id: string, edit: HighlightEdit): Promise<Highlight> {
    if (edit.color !== undefined) checkColor(edit.color);
    const doc = this.existing(source);
    const item = doc.highlights.find((h) => h.id === id);
    if (!item) throw new Error(`No highlight ${id} in this source`);
    if (edit.color !== undefined) item.color = edit.color;
    if (edit.comment !== undefined) {
      if (edit.comment.trim()) item.comment = edit.comment.trim();
      else delete item.comment;
    }
    this.saveDoc(source, doc);
    return (await this.withCards([highlightOf(item)!]))[0]!;
  }

  async removeHighlight(source: string, id: string): Promise<void> {
    const doc = this.existing(source);
    const at = doc.highlights.findIndex((h) => h.id === id);
    if (at < 0) throw new Error(`No highlight ${id} in this source`);
    doc.highlights.splice(at, 1);
    this.saveDoc(source, doc);
  }

  async highlightCard(source: string, id: string, date: string): Promise<NoteFile> {
    const doc = this.existing(source);
    const item = doc.highlights.find((h) => h.id === id);
    const h = item && highlightOf(item);
    if (!item || !h) throw new Error(`No highlight ${id} in this source`);
    const [known] = await this.withCards([h]);
    if (known?.card) return this.read(known.card);
    const made = await this.create({ kind: "highlight", title: cardTitle(h.text), date });
    const { prefix } = splitFrontmatter(made.text);
    const from = `{file: ${writeFlow(source)}, page: ${h.page}, highlight: ${h.id}}`;
    const title = typeof doc.title === "string" && doc.title.trim() ? doc.title.trim() : stemOf(source);
    const card = this.put(made.meta.path, setFrontmatterKey(prefix, "source", from, eolOf(made.text), true) + cardBody(h, title, source, made.meta.path));
    item.card_id = card.meta.id;
    this.saveDoc(source, doc);
    return card;
  }
}
