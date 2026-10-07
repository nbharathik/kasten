// What every property cell gets: its value as shown (a save on its way
// already applied), whether it is being edited, and how to save and close.

import type { RefObject } from "react";

import type { PropDef } from "../../../../../lib/vault/types";
import type { Move } from "../context";

export interface TypeCellProps {
  /** The value shown: saved, or on its way to being saved. */
  value: unknown;
  def: PropDef;
  editing: boolean;
  /** The character typed to open the editor, if one was. */
  seed: string | null;
  /** "status of Book flights", for the editor's label. */
  label: string;
  /** The note's path: a relation cannot point at the note itself. */
  path: string;
  /** The cell, for menus to sit beside. */
  anchor: RefObject<HTMLDivElement | null>;
  /** Shows the value at once and writes it; a refusal puts the old one back. */
  save(value: unknown): void;
  /** Closes the editor: Tab moves on; keys go back to the grid unless `refocus` is false. */
  finish(move?: Move, refocus?: boolean): void;
}
