// Where the person is in the editor, for the commands that depend on it. Select all is the one that matters: it takes the words of the
// box or the field being typed in, the elements of the slide, the slides of the filmstrip or the grid, or the text of the outline or of
// a panel, and a menu that runs it has taken the focus by then. So the editor notes where the focus last was, outside its menus, and the
// regions that know how to select all of what they hold say so here while they are shown.

/** The places that keep their own select all. */
export type SelectAllPlace = "slides" | "outline";

/** Menus and the like: what has the focus there is not where the person was. */
const TRANSIENT = ".ks-popover, .ks-scrim, [role='menu']";

export class Areas {
  private last: HTMLElement | null = null;
  private readonly places = new Map<SelectAllPlace, () => void>();

  /** Called with whatever takes the focus inside the editor. */
  noteFocus(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement) || target.closest(TRANSIENT)) return;
    this.last = target;
  }

  /** Called when something inside the editor loses the focus to nothing (a press on text that cannot take it). */
  noteBlur(target: EventTarget | null, next: EventTarget | null): void {
    if (next === null && target === this.last) this.last = null;
  }

  /** The element that last had the focus in the editor, outside its menus, if it is still on the page. */
  get focused(): HTMLElement | null {
    return this.last?.isConnected ? this.last : null;
  }

  /** A region says what its select all does while it is shown. Returns how to take that back. */
  register(place: SelectAllPlace, run: () => void): () => void {
    this.places.set(place, run);
    return () => {
      if (this.places.get(place) === run) this.places.delete(place);
    };
  }

  /** Runs the select all of a place. Answers whether some region has one. */
  run(place: SelectAllPlace): boolean {
    const run = this.places.get(place);
    if (!run) return false;
    run();
    return true;
  }
}
