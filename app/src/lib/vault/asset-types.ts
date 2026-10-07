// Pictures kept in assets/ as the core describes them (crates/kasten-core/src/
// assets): one file each, kept once, with a sidecar in a hidden .meta folder
// beside it that remembers where it came from. Notes, boards and decks refer
// to a picture by its path; where it is used is worked out by looking.

/** How a picture came into the vault (kasten-core `AssetSource`). */
export type AssetSourceName = "pasted" | "file" | "pdf-clip" | "agent" | "pptx-import";

/** [x1, y1, x2, y2] in PDF points from the page's bottom left, as pdf.js reports them. */
export type ClipRect = [number, number, number, number];

/** Where a figure was clipped from: a paper in sources/, the page (from 1) and the rectangle. */
export interface PdfClip {
  pdf: string;
  page: number;
  rect: ClipRect;
}

/** A picture as the gallery lists it. */
export interface AssetInfo {
  /** Where notes, boards and decks find it: `assets/figure.png`. */
  path: string;
  /** The name it came with, or its file's name for an old file. */
  name: string;
  /** Null for an old file until it has a sidecar. */
  id: string | null;
  bytes: number;
  /** Null in a list for a file without a sidecar; `asset(path)` reads it. */
  sha256: string | null;
  width: number | null;
  height: number | null;
  /** One of AssetSourceName, or what another version wrote; null when not known. */
  source: string | null;
  /** `person` or `agent:<session>`; null when not known. */
  createdBy: string | null;
  created: string | null;
  /** When it came in, in milliseconds: `created`, or the file's time. */
  added: number;
  tags: string[];
  caption: string | null;
  citationKey: string | null;
  clip: PdfClip | null;
  /** The deck a PowerPoint import brought it from. */
  deck: string | null;
  /** The title of the paper a clipped figure came from. */
  paper: string | null;
  /** Whether it has a sidecar. */
  described: boolean;
}

/** What a new picture remembers besides its bytes (kasten-core `NewAsset`). */
export interface NewAsset {
  /** Left out, a person's is a file and an agent's is an agent's. */
  source?: AssetSourceName;
  caption?: string | null;
  tags?: string[];
  citationKey?: string | null;
  /** Needed for `pdf-clip`, and only for it. */
  clip?: PdfClip | null;
  /** The deck a `pptx-import` picture came from. */
  deck?: string | null;
}

/** Each field given replaces the old value; an empty caption or key clears it. */
export interface AssetEdit {
  tags?: string[];
  caption?: string;
  citationKey?: string;
}

export interface AddedAsset {
  /** Where the picture is: a new file, or the one already holding these bytes. */
  path: string;
  /** False when the same bytes were already kept, so nothing was written. */
  created: boolean;
  asset: AssetInfo;
}

/** A note or a board that shows a picture. */
export interface UsePlace {
  path: string;
  title: string;
}

export interface SlideUse {
  /** From 1. */
  number: number;
  id: string;
}

export interface DeckUse {
  path: string;
  title: string;
  slides: SlideUse[];
  /** The deck's theme shows it too (on every slide of a layout). */
  theme: boolean;
}

/** Where a picture is used. */
export interface AssetUsage {
  notes: UsePlace[];
  boards: UsePlace[];
  decks: DeckUse[];
}

/** The vault client's part for the gallery (commands/assets.rs). */
export interface AssetOps {
  /** Keeps a picture in assets/ with its sidecar. The same bytes anywhere in assets/ are the same asset. */
  addAsset(name: string, bytes: Uint8Array, meta?: NewAsset): Promise<AddedAsset>;
  /** The pictures in assets/, newest first. */
  assets(): Promise<AssetInfo[]>;
  /** One picture in full, its hash included. */
  asset(path: string): Promise<AssetInfo>;
  setAssetMeta(path: string, edit: AssetEdit): Promise<AssetInfo>;
  /** A WebP thumbnail of 256 or 1024 pixels; undefined when the picture has none (a vector picture): show the original. */
  assetThumb(path: string, size: 256 | 1024): Promise<Uint8Array | undefined>;
  /** Where one picture is used. */
  assetUsage(path: string): Promise<AssetUsage>;
  /** The use of every picture that is used, from one look; a picture not in the map is unused. */
  assetsUsage(): Promise<Record<string, AssetUsage>>;
}
