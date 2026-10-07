// Where a database's new notes go: a database made in a page
// keeps its notes as that page's sub-pages, so they live under it; one in a
// project's home, in the project; else the library.

import { createContext, useContext } from "react";

export interface NoteHome {
  /** The project folder, or null. */
  project: string | null;
  /** The page they are sub-pages of, by path, or null. */
  parent: string | null;
}

export const NoteHomeContext = createContext<NoteHome>({ project: null, parent: null });

export const useNoteHome = () => useContext(NoteHomeContext);
