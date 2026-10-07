// How the pointer picks slides, for the filmstrip and the grid alike.

import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { extendedTo, toggled } from "./selection.ts";

/**
 * A click on a slide. Plain, it shows the slide and picks only it; with Ctrl
 * or Cmd it joins the pick or leaves it; with Shift it picks the range from
 * the slide shown. `visible` is the slides that can be seen, in deck order.
 */
export function pickSlide(session: EditorSession, visible: readonly string[], keys: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, id: string): void {
  const { slideId, slideSelection } = session.state;
  if (keys.shiftKey) {
    const range = extendedTo(visible, slideId, id);
    session.selectSlides(range.ids, range.show);
  } else if (keys.ctrlKey || keys.metaKey) {
    const choice = toggled(visible, slideSelection, slideId, id);
    if (choice) session.selectSlides(choice.ids, choice.show);
  } else {
    session.selectSlides([id]);
  }
}

/** A right click on a slide: the slide is picked first unless it is one of those already, then the slide menu opens at the pointer. */
export function openSlideMenu(session: EditorSession, ui: EditorUi, id: string, at: { x: number; y: number }): void {
  if (!session.state.slideSelection.includes(id)) session.selectSlides([id]);
  ui.openContextMenu({ kind: "slide", x: at.x, y: at.y });
}
