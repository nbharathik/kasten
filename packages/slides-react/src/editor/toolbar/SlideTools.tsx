import { builtInThemes } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { SEPARATOR, commandItem, plainItem } from "../menus/build.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import type { MenuItem } from "../ui/Menu.tsx";
import { useEditor } from "../useEditor.ts";
import { CommandButton, MenuButton } from "./ToolButton.tsx";

const FALLBACK_THEMES = ["Light", "Dark", "Serif", "Lecture"];

/** The themes that come with the editor. */
function themeNames(): string[] {
  try {
    return builtInThemes();
  } catch {
    // The engine is not loaded (it always is once a deck is open).
    return FALLBACK_THEMES;
  }
}

/** The slide's background, its layout, the deck's theme and the transition into the slide. */
export function SlideTools({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const state = useEditor(session);
  const ctx = { session, ui };
  const layout = session.slide.layout;

  const layouts = (): MenuItem[] =>
    state.deck.theme.layouts.map((l) => plainItem(`layout-${l.name}`, l.label, () => session.slides.setLayout(l.name), { checked: l.name === layout }));

  const themes = (): MenuItem[] => [
    ...themeNames().map((name) => plainItem(`theme-${name}`, name, () => session.slides.applyTheme(name), { checked: name === state.deck.theme.name })),
    SEPARATOR,
    commandItem("slide.theme", ctx),
  ];

  return (
    <div className="ks-tb-slide">
      <CommandButton id="slide.background" ctx={ctx} label="Background" icon="image" text="Background" />
      <MenuButton ui={ui} label="Layout" icon="layout-template" text="Layout" items={layouts} />
      <MenuButton ui={ui} label="Theme" icon="palette" text="Theme" items={themes} />
      <CommandButton id="slide.transition" ctx={ctx} label="Transition" text="Transition" />
    </div>
  );
}
