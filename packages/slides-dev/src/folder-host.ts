import type { DeliveredFile, HostImage, ImageEdit, ImageUse, SaveOutcome, SlidesHost } from "@kasten-slides/react";

import { type AssetEntry, type FolderApi, contentHash } from "./api.ts";
import { go } from "./route.ts";

/** A picture of the folder as the editor's host image: what is known, and nothing for what is not. */
export function hostImage(a: AssetEntry): HostImage {
  return {
    path: a.path,
    name: a.name,
    bytes: a.bytes,
    added: a.added,
    tags: a.tags,
    ...(a.width !== undefined && a.height !== undefined ? { width: a.width, height: a.height } : {}),
    ...(a.id ? { id: a.id } : {}),
    ...(a.source ? { source: a.source } : {}),
    ...(a.createdBy ? { createdBy: a.createdBy } : {}),
    ...(a.caption ? { caption: a.caption } : {}),
    ...(a.citationKey ? { citationKey: a.citationKey } : {}),
    ...(a.clip ? { clip: a.clip } : {}),
    ...(a.deck ? { deck: a.deck } : {}),
  };
}

/** Pictures the server can make a small WebP copy of. */
const RASTER = /\.(png|jpe?g|gif|webp)$/i;

/**
 * The editor's host for one deck in the folder `slides dev` serves. It
 * remembers the hash of the version it last read or wrote, and a save brings
 * that back: the server refuses to overwrite a file that changed meanwhile.
 */
export class FolderHost implements SlidesHost {
  /** The hash of the file as this host last saw it. */
  base: string;
  /** Where the deck is kept: its file name in the folder. */
  readonly deckPath: string;

  constructor(
    private readonly api: FolderApi,
    readonly path: string,
    hash: string,
    private readonly hand: (file: DeliveredFile) => void,
  ) {
    this.base = hash;
    this.deckPath = path;
  }

  async save(text: string, options?: { overwrite?: boolean }): Promise<SaveOutcome> {
    const base = options?.overwrite ? (await this.api.deck(this.path)).hash : this.base;
    const saved = await this.api.save(this.path, text, base);
    if (saved.status === "conflict") return { status: "conflict", theirs: saved.deck.text, copy: saved.copy };
    this.base = saved.deck.hash;
    return { status: "saved" };
  }

  synced(text: string): void {
    this.base = contentHash(text);
  }

  imageUrl(path: string): string | undefined {
    return path.startsWith("assets/") ? this.api.assetUrl(path) : undefined;
  }

  addImage(name: string, bytes: Uint8Array, options?: { source?: "pasted" | "file" | "pptx-import"; deck?: string }): Promise<string> {
    // The folder keeps where a picture came from as pasted or chosen; a picture of an import is a chosen one.
    return this.api.addAsset(name, bytes, options?.source === "pasted" ? "pasted" : "file");
  }

  deliver(file: DeliveredFile): Promise<void> {
    this.hand(file);
    return Promise.resolve();
  }

  async images(): Promise<HostImage[]> {
    return (await this.api.assets()).map(hostImage);
  }

  async assetInfo(path: string): Promise<HostImage | undefined> {
    return (await this.images()).find((image) => image.path === path);
  }

  /** The server's small copy of a raster picture; a vector picture is shown as it is. */
  thumbnailUrl(path: string, size: 256 | 1024): string | undefined {
    return RASTER.test(path) ? this.api.thumbUrl(path, size) : undefined;
  }

  imageUsage(): Promise<Record<string, ImageUse>> {
    return this.api.usage();
  }

  async setImageMeta(path: string, edit: ImageEdit): Promise<HostImage> {
    return hostImage(await this.api.setAssetMeta(path, edit));
  }

  /** Follows the folder's own changes: a picture added or replaced outside the page. */
  watchImages(onChange: () => void): () => void {
    return this.api.events((event) => event.kind === "asset" && onChange());
  }

  /** Another deck of the folder opens in the page; the folder has no notes or boards. */
  openPath(path: string): void {
    if (path.endsWith(".deck")) go(path);
  }

  /** The `.bib` files of the folder: what a citation key is looked up in. */
  references(): Promise<string> {
    return this.api.references();
  }

  /** Follows the folder's own changes: a `.bib` file edited, added or removed outside the page, so the open deck is drawn from the new bibliography. */
  watchReferences(onChange: () => void): () => void {
    return this.api.events((event) => event.kind === "references" && onChange());
  }

  openUrl(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
