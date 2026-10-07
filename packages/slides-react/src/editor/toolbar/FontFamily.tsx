import type { JSX } from "react";

import { textFormat } from "../commands/index.ts";
import { SEPARATOR, plainItem } from "../menus/build.ts";
import type { EditorUi } from "../ui-state.ts";
import type { MenuItem } from "../ui/Menu.tsx";
import { MenuButton } from "./ToolButton.tsx";
import type { TextView } from "./useTextView.ts";

/** Families that most computers have or that the editor brings, offered after the theme's own. */
export const COMMON_FONTS = ["Arial", "Calibri", "Cambria", "Courier New", "Georgia", "Helvetica", "Inter", "Lato", "Montserrat", "Open Sans", "Roboto", "Roboto Mono", "Times New Roman", "Trebuchet MS", "Verdana"];

const ROLES = [
  { role: "heading", label: "Heading font" },
  { role: "body", label: "Body font" },
  { role: "code", label: "Code font" },
] as const;

const isRole = (font: string): font is (typeof ROLES)[number]["role"] => ROLES.some((r) => r.role === font);

/** The family name to show for a font: a theme role is spelled out as the family the theme gives it. */
function familyOf(font: string, families: Record<string, { family: string }>): string {
  return isRole(font) ? (families[font]?.family ?? font) : font;
}

/** The font of the words in hand: a compact dropdown, theme fonts first. */
export function FontFamily({ view, ui }: { view: TextView; ui: EditorUi }): JSX.Element {
  const { ctx, format, can, base } = view;
  const { fonts } = ctx.session.deck.theme;
  const current = format.font ?? base.font;
  const shown = current === "mixed" ? "Mixed" : familyOf(current, fonts);

  const items = (): MenuItem[] => {
    const has = (name: string) => current !== "mixed" && !isRole(current) && current.toLowerCase() === name.toLowerCase();
    return [
      ...ROLES.map(({ role, label }) =>
        plainItem(`font-${role}`, label, () => textFormat.setFont(ctx, role), { checked: current === role, trailing: <span className="ks-tb-hint">{fonts[role].family}</span> }),
      ),
      SEPARATOR,
      ...COMMON_FONTS.map((name) => plainItem(`font-${name}`, name, () => textFormat.setFont(ctx, name), { checked: has(name) })),
    ];
  };

  return <MenuButton ui={ui} label="Font" className="ks-tb-font" text={shown} disabled={!can} items={items} />;
}
