/** The keys held while a drag goes on; the editor reads them from each pointer event. */
export interface Mods {
  shift?: boolean;
  alt?: boolean;
  /** Switches snapping off without using Alt, which a resize gives to "from the centre". */
  noSnap?: boolean;
}
