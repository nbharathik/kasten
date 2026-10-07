// Select all, in each place of the editor. One function serves the key (Ctrl+A on the slide, or anywhere the editor has not a field of
// its own), the Edit menu and the right-click menus, so they cannot disagree:
//   a text box being edited            its words (the text editor's own select all)
//   a field (the notes, a name …)      the field's text
//   the outline                        the text of every row
//   the filmstrip, the grid            every slide that can be seen
//   a panel, the images drawer         the text of that region
//   the slide, or nothing in particular  the elements of the slide

import type { CommandContext } from "../commands/types.ts";
import { isTextField, selectFieldText, selectRegionText } from "./dom.ts";

/** The regions whose text is selected, all of it, when select all is asked for while the focus is in them. A dialog does its own. */
export const TEXT_REGIONS = ".ks-side-panel, .ks-gallery";

/** Select all, where the person is. */
export function selectAllHere({ session, ui }: CommandContext): void {
  // A text box being edited: the text editor selects its own words.
  const text = ui.state.text;
  if (text) {
    text.selectAll();
    return;
  }
  const { view } = ui.state;
  if (view === "outline" && ui.areas.run("outline")) return;
  if (view === "grid" && ui.areas.run("slides")) return;
  const focus = ui.areas.focused;
  if (focus) {
    // A field first: the name of a section in the filmstrip is a field, and select all in it is its text.
    if (isTextField(focus)) {
      selectFieldText(focus);
      return;
    }
    if (focus.closest(".ks-filmstrip") && ui.areas.run("slides")) return;
    const region = focus.closest(TEXT_REGIONS);
    if (region) {
      selectRegionText(region);
      return;
    }
  }
  session.selectAll();
}
