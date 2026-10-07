// Accepting an assistant's work: the person looks at it and the badge comes off. One engine operation, so one step of undo.

import { markedAmong, pendingIn } from "../agent/marks.ts";
import type { EditorSession } from "./session.ts";

export class MarkCommands {
  constructor(private readonly s: EditorSession) {}

  /** How many elements of the deck an assistant made or changed that nobody has accepted. */
  get pending(): number {
    return pendingIn(this.s.state.deck);
  }

  /** The marked elements among the selected ones. */
  get selected(): string[] {
    return markedAmong(this.s.slide, this.s.state.selection);
  }

  /** Accepts the marked elements among `ids` (the selected ones by default) of the slide shown. Answers how many were accepted. */
  accept(ids: readonly string[] = this.s.state.selection): number {
    const slide = this.s.slide;
    const marked = markedAmong(slide, ids);
    if (marked.length === 0) return 0;
    return this.s.run(() => this.s.core.apply("accept_marks", { slide: slide.id, ids: marked }))?.output.count ?? 0;
  }

  /** Accepts everything in the deck. */
  acceptAll(): number {
    if (this.pending === 0) return 0;
    return this.s.run(() => this.s.core.apply("accept_marks", {}))?.output.count ?? 0;
  }
}
