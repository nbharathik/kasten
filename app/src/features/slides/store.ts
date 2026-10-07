// The vault's slide decks, for tabs, the Slides view and the sidebar. Loaded
// when the vault opens and again whenever a deck file changes.

import { create } from "zustand";

import type { DeckInfo } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";

interface DecksState {
  list: DeckInfo[];
  loaded: boolean;
  /** The Slides view's "New deck" form is open. */
  creating: boolean;
  /** The project the form starts with, when opened from one. */
  draftProject: string | null;
  /** Reads the list again; the old one stays if that fails. */
  load(): Promise<void>;
}

/** The latest load; an older one answering later is dropped. */
let latest = 0;

export const useDecks = create<DecksState>((set) => ({
  list: [],
  loaded: false,
  creating: false,
  draftProject: null,
  async load() {
    const client = useWorkspace.getState().client;
    if (!client) return;
    const mine = ++latest;
    try {
      const list = await client.decks();
      if (mine === latest) set({ list, loaded: true });
    } catch {
      // Keep what we had.
    }
  },
}));

/** Opens the Slides view on its "New deck" form, in `project` if given. */
export function startNewDeck(project: string | null = null): void {
  useWorkspace.getState().go({ view: "slides" });
  useDecks.setState({ creating: true, draftProject: project });
}

/** A deck's title from the list, else its file name. */
export function deckTitle(list: readonly DeckInfo[], path: string): string {
  return list.find((d) => d.path === path)?.title ?? path.slice(path.lastIndexOf("/") + 1).replace(/\.deck$/, "");
}
