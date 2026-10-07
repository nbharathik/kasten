// Slide decks as the vault holds them. A deck's text belongs to the Slides
// editor's engine, which reads and writes it; the vault only stores it.

/** A deck in lists. */
export interface DeckInfo {
  path: string;
  title: string;
  project: string | null;
  slides: number;
  modified: number;
  size: number;
  /** Why the deck can't be read, when it can't: it is still listed. */
  problem: string | null;
}

/** A deck as it is on disk, with the hash a save brings back. */
export interface DeckFile {
  path: string;
  text: string;
  hash: string;
  modified: number;
}

/** What saving a deck did. */
export type DeckSaved =
  | { status: "written"; deck: DeckFile }
  | { status: "unchanged"; deck: DeckFile }
  /** The file changed since it was read: the text went to `copy` and `deck` is the file as it is. */
  | { status: "conflict"; copy: string; deck: DeckFile };
