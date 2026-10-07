// Sources and highlights as the core keeps them (crates/kasten-core/src/
// sources): PDFs in sources/, each with a sidecar of highlights. Rectangles
// are in PDF user space, [x1, y1, x2, y2] in points from the page's bottom
// left, as pdf.js converts them.

import type { NoteFile } from "./types";

/** The colours a highlight comes in (kasten-core `COLORS`). */
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "purple"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export type PdfRect = [number, number, number, number];

export interface SourceInfo {
  path: string;
  /** The name it was imported under, or its file name. */
  title: string;
  highlights: number;
  bytes: number;
  modified: number;
}

export interface Highlight {
  id: string;
  /** From 1. */
  page: number;
  rects: PdfRect[];
  /** The quoted text, as selected. */
  text: string;
  /** One of HIGHLIGHT_COLORS, or what another tool wrote. */
  color: string;
  comment: string | null;
  /** The id of its highlight card, once made. */
  cardId: string | null;
  created: string | null;
  /** The path of its card, while that note exists. */
  card: string | null;
}

export interface NewHighlight {
  page: number;
  rects: PdfRect[];
  text: string;
  color: HighlightColor;
  comment?: string | null;
}

/** Each field given replaces the old value; an empty comment removes it. */
export interface HighlightEdit {
  color?: HighlightColor;
  comment?: string;
}

export interface SourceHighlights {
  source: SourceInfo;
  highlights: Highlight[];
}

/** The vault client's part for sources (commands/sources.rs). */
export interface SourceOps {
  /** Keeps a PDF in sources/ and returns its path; the same bytes are reused. */
  importSource(name: string, bytes: Uint8Array): Promise<string>;
  /** A source's bytes, for the reader. */
  readSource(path: string): Promise<Uint8Array>;
  sources(): Promise<SourceInfo[]>;
  highlights(source: string): Promise<Highlight[]>;
  /** Every source with its highlights, by title. */
  allHighlights(): Promise<SourceHighlights[]>;
  addHighlight(source: string, highlight: NewHighlight): Promise<Highlight>;
  editHighlight(source: string, id: string, edit: HighlightEdit): Promise<Highlight>;
  removeHighlight(source: string, id: string): Promise<void>;
  /** The highlight's card, made on first asking in the Inbox. `date` is the local day. */
  highlightCard(source: string, id: string, date: string): Promise<NoteFile>;
}
