// How the words in hand look, as the menus and the toolbar show it.

import { type CommandContext, textFormat } from "../commands/index.ts";
import { placeholderOf } from "../../theme/index.ts";
import { EMPTY_RUN, resolveStyle } from "../../text/text-style.ts";
import type { EditorSession } from "../session/session.ts";
import type { FormatState } from "../session/text-commands.ts";

/** How the text style looks, for words whose own size, font, colour and weight are not set. */
export interface BaseLook {
  size: number;
  /** A theme font role or a family name. */
  font: string;
  /** A theme colour token or a hex value. */
  color: string;
  bold: boolean;
  italic: boolean;
}

/** The look of the text style of the box in hand (the one being edited, else the first selected). */
export function baseLookOf(session: EditorSession): BaseLook {
  const { theme } = session.deck;
  const id = session.state.editing ?? session.state.selection[0];
  const element = id ? session.elements.find([id])[0] : undefined;
  const slot = element ? placeholderOf(theme, session.slide.layout, element) : undefined;
  const text = element?.type === "text" || element?.type === "shape" ? element.text : null;
  const look = resolveStyle(theme, slot?.style ?? "body", text?.paragraphs[0] ?? { runs: [] }, EMPTY_RUN);
  return { size: look.size, font: look.font, color: look.color, bold: look.bold, italic: look.italic };
}

/**
 * How the words in hand look: the open text box's selection, else the selected
 * boxes. A title is bold in its text style without a word being marked bold;
 * the text box counts that, and this counts it for selected boxes too, so Bold
 * is on for a title whichever way it is looked at.
 */
export function shownFormat(ctx: CommandContext, base: BaseLook = baseLookOf(ctx.session)): FormatState {
  const format = textFormat.currentFormat(ctx);
  if (ctx.ui.state.text) return format;
  return {
    ...format,
    bold: format.bold === false && base.bold ? true : format.bold,
    italic: format.italic === false && base.italic ? true : format.italic,
  };
}
