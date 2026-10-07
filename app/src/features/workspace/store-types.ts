// The workspace store's shape: what the window holds (the vault, its notes,
// the layout, notices) and what it can do with them.

import type { NewNote, NoteFile, NoteMeta, Renamed, VaultClient } from "../../lib/vault/types";
import type { DraftSpec } from "./drafts";
import type { LayoutState, OpenHow } from "./store-layout";
import type { Place } from "./tabs";
import type { Connection } from "./vault";

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export type Draft = Omit<NewNote, "date"> & { date?: string };

export interface WorkspaceState extends LayoutState {
  client: VaultClient | null;
  problem: string | null;
  /** No vault is open: the window offers to create or open one. */
  choosing: boolean;
  ready: boolean;
  notes: NoteMeta[];
  /** Paths opened lately, newest first. */
  recent: string[];
  /** The person has gone somewhere since the window opened. */
  navigated: boolean;
  toasts: Toast[];
  connect(connection: Connection): Promise<void>;
  refresh(): Promise<void>;
  /** Takes in files the watcher reported, asking only for those notes. */
  filesChanged(paths: string[]): Promise<void>;
  /** Opens a place: in the focused tab, or `how` asks (tab, split, stack). */
  go(place: Place, how?: OpenHow): void;
  goBack(): void;
  goForward(): void;
  openPath(path: string, how?: OpenHow): void;
  openTitle(title: string, how?: OpenHow): Promise<void>;
  create(draft: Draft, open?: boolean): Promise<NoteFile | null>;
  /** Opens a new page as a draft: no file until its first input (drafts.ts). */
  newPage(spec?: Partial<DraftSpec>, how?: OpenHow): void;
  openJournal(date?: string, how?: OpenHow): Promise<void>;
  /** Makes sure a journal day exists (from the template on first use) and
   * gives its path, without opening it. */
  ensureJournal(date?: string): Promise<string | null>;
  /** Remembers a note as recently opened. */
  recentVisit(place: Place): void;
  /** Fills an empty page from `templates/<template>.md`. */
  applyTemplate(path: string, template: string): Promise<NoteFile | null>;
  /** Opens the tour of the app, making its page the first time. */
  takeTour(): Promise<void>;
  /** Moves a note (with its sub-pages) or a board to the trash; where it
   * went, or null when it could not. The notice offers Undo unless `quiet`. */
  trash(path: string, quiet?: boolean): Promise<string | null>;
  restore(trashed: string): Promise<void>;
  /** Takes in a note the client just returned. */
  noteChanged(meta: NoteMeta): void;
  /** Gives a note a new title (not the open one: its title field does
   * that); the notice offers Undo. */
  rename(path: string, title: string): Promise<void>;
  /** Copies a page beside itself and opens the copy; Undo trashes it. */
  duplicate(path: string): Promise<void>;
  /** Moves a note and its sub-pages into a project, or with null to the
   * library; its new path. The notice offers Undo unless `quiet`. */
  move(path: string, project: string | null, quiet?: boolean): Promise<string | null>;
  /** Makes a card a page or a page a card, filed where that kind lives;
   * Undo turns it back. */
  convert(path: string, kind: "card" | "page"): Promise<void>;
  /** Follows a note to its new path, with the sub-pages that moved along,
   * and reloads the list. */
  renamed(from: string, renamed: Renamed, moves?: readonly (readonly [string, string])[]): Promise<void>;
  toast(text: string, action?: Toast["action"]): void;
  dismiss(id: number): void;
}
