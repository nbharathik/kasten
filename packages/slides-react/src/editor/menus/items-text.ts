// The text sub-menus (marks, alignment, lists, line spacing), shared by the
// Format menu and the toolbar's align and line spacing buttons. They show how
// the selected words look now (a check mark) and are disabled when nothing
// selected holds text.

import { type CommandContext, textFormat } from "../commands/index.ts";
import { type Row, commandItem, plainItem } from "./build.ts";
import { shownFormat } from "./format-view.ts";

/** The line spacings on offer, as multiples of the line height. */
export const LINE_SPACINGS = [1, 1.15, 1.5, 2];

/** Bold, italic, underline, strikethrough and code. */
export function markItems(ctx: CommandContext): Row[] {
  const format = shownFormat(ctx);
  const disabledIf = !textFormat.canFormat(ctx);
  const on = { bold: format.bold, italic: format.italic, underline: format.underline, strike: format.strike, code: format.code };
  return (["bold", "italic", "underline", "strike", "code"] as const).map((id) => commandItem(`text.${id}`, ctx, { disabledIf, checked: on[id] === true }));
}

/** Left, centre, right and justify; the one in use is checked. */
export function alignItems(ctx: CommandContext, labels: Partial<Record<"left" | "center" | "right" | "justify", string>> = {}): Row[] {
  const align = textFormat.currentFormat(ctx).align;
  const disabledIf = !textFormat.canFormat(ctx);
  return (["left", "center", "right", "justify"] as const).map((id) => {
    const label = labels[id];
    return commandItem(`text.align-${id}`, ctx, { disabledIf, checked: align === id, ...(label ? { label } : {}) });
  });
}

export const indentItems = (ctx: CommandContext): Row[] => {
  const disabledIf = !textFormat.canFormat(ctx);
  return [commandItem("text.indent", ctx, { disabledIf }), commandItem("text.outdent", ctx, { disabledIf })];
};

/** Bulleted and numbered lists; the one in use is checked. */
export function listItems(ctx: CommandContext): Row[] {
  const list = textFormat.currentFormat(ctx).list;
  const disabledIf = !textFormat.canFormat(ctx);
  return [commandItem("text.bullets", ctx, { disabledIf, checked: list === "bullet" }), commandItem("text.numbers", ctx, { disabledIf, checked: list === "number" })];
}

/** 1, 1.15, 1.5, 2 and the text style's own. */
export function spacingItems(ctx: CommandContext): Row[] {
  const now = textFormat.currentFormat(ctx).lineSpacing;
  const disabled = !textFormat.canFormat(ctx);
  return [
    ...LINE_SPACINGS.map((multiple) => plainItem(`spacing-${multiple}`, String(multiple), () => textFormat.setLineSpacing(ctx, multiple), { checked: now === multiple, disabled })),
    plainItem("spacing-default", "Default", () => textFormat.setLineSpacing(ctx, null), { checked: now === null, disabled }),
  ];
}
