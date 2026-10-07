// What the editor needs from the place it runs in. The editor never touches
// files, the network or the operating system itself: Kasten, the `slides dev`
// folder host and the tests each provide these.

import type { Deck } from "@kasten-slides/wasm";
import type { ComponentType } from "react";

import type { PresentSync } from "../present/sync.ts";

/** What a save did. */
export type SaveOutcome =
  | { status: "saved" }
  /** The file changed since the editor read it. `theirs` is what is there now; `copy` is where the editor's text was kept, if the host kept it. */
  | { status: "conflict"; theirs: string; copy?: string | null };

/** An image the host holds, with what it remembers of it. Everything past `name` is optional: a host tells what it knows. */
export interface HostImage {
  /** The path a deck stores in an image element's `src`. */
  path: string;
  name: string;
  width?: number;
  height?: number;
  bytes?: number;
  /** When it was added, in milliseconds. */
  added?: number;
  /** Names the bytes: the same bytes are the same image, whatever they are called. */
  id?: string;
  /** How it came in: `pasted`, `file`, `pdf-clip`, `agent` or `pptx-import`. */
  source?: string;
  /** `person`, or `agent:<session>`. */
  createdBy?: string;
  tags?: string[];
  caption?: string;
  /** The BibTeX key of the paper it comes from. */
  citationKey?: string;
  /** Where on which paper a figure was clipped: the PDF's path, the page from 1, and the rectangle in PDF points. */
  clip?: { pdf: string; page: number; rect: [number, number, number, number] };
  /** The title of the paper a clipped figure comes from. */
  paper?: string;
  /** The deck a PowerPoint import brought it from. */
  deck?: string;
}

/** What a person changes about an image: tags replaced, a caption or citation key set (empty clears it). */
export interface ImageEdit {
  tags?: string[];
  caption?: string;
  citationKey?: string;
}

/** Where an image is used, computed by looking, never stored. */
export interface ImageUse {
  notes: { path: string; title: string }[];
  boards: { path: string; title: string }[];
  /** Decks that show it: the slides (from 1) and whether the deck's theme does. */
  decks: { path: string; title: string; slides: { number: number; id: string }[]; theme: boolean }[];
}

/** A finished file handed to the person: an export. */
export interface DeliveredFile {
  name: string;
  bytes: Uint8Array;
  type: string;
}

/** What the host's assistant panel is told: where the person is in the deck. It is given again when the slide, the selection or the marks change. */
export interface AiPanelProps {
  /** Where the deck is kept, as the host names decks (a vault path in Kasten); none when the host keeps it nowhere. */
  deckPath: string | undefined;
  deckTitle: string;
  /** The name of the deck's theme. */
  theme: string;
  /** The slide on the canvas: its id, its place from 1 in the deck's `slideCount` slides, and its title. */
  slideId: string;
  slideNumber: number;
  slideCount: number;
  slideTitle: string;
  /** The elements selected on that slide, by id (empty when none is). */
  elementIds: readonly string[];
  /** How many elements of the deck an assistant made or changed that nobody has accepted or changed since (they show a badge). */
  pending: number;
  /** Accepts them all, as "Accept all" in the editor's menus does. */
  acceptAll(): void;
}

export interface SlidesHost {
  /** Where the deck being edited is kept, as the host names decks (the gallery leaves it out of the other decks that use an image). */
  readonly deckPath?: string;
  /** Writes the deck's text. With `overwrite` it replaces the file even though it changed since it was read. */
  save(text: string, options?: { overwrite?: boolean }): Promise<SaveOutcome>;
  /** A URL an image element can load for a stored image path; undefined when there is none. */
  imageUrl(path: string): string | undefined;
  /**
   * Keeps an image the person pasted, dropped or chose; resolves to its path. The same bytes kept before
   * resolve to the path they have (a picture pasted twice is one image). `source` says how it came in; a picture of
   * a PowerPoint import says which `deck` (its title) it was brought from.
   */
  addImage(name: string, bytes: Uint8Array, options?: { source?: "pasted" | "file" | "pptx-import"; deck?: string }): Promise<string>;
  /**
   * The bytes of an image the host holds, by the path a deck stores; undefined
   * when there are none. Without this the editor fetches `imageUrl`. An export
   * packs the pictures it needs into its file with it.
   */
  readImage?(path: string): Promise<Uint8Array | undefined>;
  /** Hands a file to the person (a download in a browser, the Downloads folder in the app). */
  deliver(file: DeliveredFile): Promise<void>;
  /** The images the host holds, newest first, for the gallery. */
  images?(): Promise<HostImage[]>;
  /** One image in full (a list may leave out what is dear to work out, such as the hash). */
  assetInfo?(path: string): Promise<HostImage | undefined>;
  /**
   * A URL to show a small copy of an image (`size` is the longer side: 256 for the grid, 1024 for a big look). A host without
   * small copies, or with none for this image (a vector picture), gives undefined and `imageUrl` is used.
   */
  thumbnailUrl?(path: string, size: 256 | 1024): Promise<string | undefined> | string | undefined;
  /** Where each image that is used is used, by path: one look at everything. An image not in the answer is unused. */
  imageUsage?(): Promise<Record<string, ImageUse>>;
  /** Changes an image's tags, caption or citation key; resolves to the image as it is now. */
  setImageMeta?(path: string, edit: ImageEdit): Promise<HostImage | undefined>;
  /** Asks for captions to be written for these images (an agent does it); the host says so when it is done. */
  describe?(paths: string[]): Promise<void>;
  /** Calls `onChange` when the images the host holds changed (added elsewhere, an agent's); returns how to stop. */
  watchImages?(onChange: () => void): () => void;
  /**
   * The bibliography, as BibTeX text: what a citation key is looked up in. Kasten gives the `.bib` files of the vault one after
   * another; `slides dev` gives the `.bib` files beside the decks. No `.bib` file is an empty text (then every key is unknown).
   * A host without this has no bibliography: keys are written as they are and lint does not check them.
   */
  references?(): Promise<string>;
  /** Calls `onChange` when the bibliography changed (a `.bib` file was edited, added or removed); returns how to stop. */
  watchReferences?(onChange: () => void): () => void;
  /** Opens a note, board or deck of the host's, from a place an image is used. */
  openPath?(path: string): void;
  /**
   * The editor now holds `text` as what is saved: it took a version from
   * outside (a change made elsewhere, or the file's version after a conflict).
   * A host that tracks which version it saved over updates that here.
   */
  synced?(text: string): void;
  /** Opens a web address outside the editor. */
  openUrl?(url: string): void;
  /** Tells the person something short. */
  notify?(message: string): void;
  /**
   * Opens the presenter's window and resolves to the link to it, or null when it could not be opened. Without this the
   * editor opens a browser window on the page's own address (`?presenter=…`), which the page has to show as the presenter's view.
   */
  openPresenter?(): Promise<PresentSync | null>;
  /**
   * A presentation of `deck` is about to open. Resolves to what is called when it closes. A host that has to permit what the deck
   * embeds (the desktop app does, for its frames) does it here.
   */
  willPresent?(deck: Deck): Promise<() => void> | (() => void) | void;
  /**
   * Fills the screen with the presentation, where the host has a better way than the page's own full screen. Resolves to what
   * gives the screen back; `onLeft` is called when the person leaves full screen some other way.
   */
  fillScreen?(onLeft: () => void): Promise<() => void>;
  /**
   * The assistant tab of the side panel, drawn by the host: Kasten gives its chat, with the deck tools. It is a component that is given
   * where the person is in the deck (`AiPanelProps`) and drawn again as that changes. A host without one shows that the assistant is not
   * available here.
   */
  aiPanel?: ComponentType<AiPanelProps>;
}
