import type { JSX } from "react";

import { textFormat } from "../commands/index.ts";
import { alignItems, spacingItems } from "../menus/items-text.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import type { IconName } from "../ui/Icon.tsx";
import { Divider } from "../ui/Button.tsx";
import { ColorButton } from "./ColorButton.tsx";
import { FontFamily } from "./FontFamily.tsx";
import { FontSize } from "./FontSize.tsx";
import { CommandButton, MenuButton } from "./ToolButton.tsx";
import { useTextView } from "./useTextView.ts";

const ALIGN_ICONS: Record<string, IconName> = {
  left: "text-align-start",
  center: "text-align-center",
  right: "text-align-end",
  justify: "text-align-justify",
  mixed: "text-align-start",
};

/** Font, size, marks, colour, link, alignment, spacing, lists, indents and clear: everything for the words in hand. */
export function TextTools({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const view = useTextView(session, ui);
  const { ctx, format, can, base } = view;
  const { theme } = session.deck;
  const color = format.color === null ? base.color : format.color;
  const on = (value: boolean | "mixed") => value === true;

  return (
    <>
      <FontFamily view={view} ui={ui} />
      <FontSize view={view} ui={ui} />
      <Divider />
      <CommandButton id="text.bold" ctx={ctx} on={on(format.bold)} disabledIf={!can} />
      <CommandButton id="text.italic" ctx={ctx} on={on(format.italic)} disabledIf={!can} />
      <CommandButton id="text.underline" ctx={ctx} on={on(format.underline)} disabledIf={!can} />
      <CommandButton id="text.strike" ctx={ctx} on={on(format.strike)} disabledIf={!can} />
      <ColorButton
        theme={theme}
        icon="baseline"
        label="Text colour"
        value={color === "mixed" ? null : color}
        mixed={color === "mixed"}
        noneLabel="Automatic"
        disabled={!can}
        onPick={(picked) => textFormat.setColor(ctx, picked)}
      />
      <CommandButton id="text.link" ctx={ctx} label="Insert link" on={typeof format.link === "string"} disabledIf={!can} />
      <Divider />
      <MenuButton ui={ui} label="Align" icon={ALIGN_ICONS[format.align] ?? "text-align-start"} disabled={!can} items={() => alignItems(ctx, { left: "Left", center: "Centre", right: "Right", justify: "Justify" })} />
      <MenuButton ui={ui} label="Line spacing" icon="list-chevrons-up-down" disabled={!can} items={() => spacingItems(ctx)} />
      <CommandButton id="text.bullets" ctx={ctx} on={format.list === "bullet"} disabledIf={!can} />
      <CommandButton id="text.numbers" ctx={ctx} on={format.list === "number"} disabledIf={!can} />
      <CommandButton id="text.outdent" ctx={ctx} disabledIf={!can} />
      <CommandButton id="text.indent" ctx={ctx} disabledIf={!can} />
      <Divider />
      <CommandButton id="text.clear" ctx={ctx} disabledIf={!can} />
    </>
  );
}
