import { DeckEngine, type Colors, builtInThemes } from "@kasten-slides/wasm";

/** A built-in theme, and its colours for a strip on its card. */
export interface ThemeChoice {
  name: string;
  colors: Colors | null;
}

const FALLBACK = ["Light", "Dark", "Serif", "Lecture"];

let known: ThemeChoice[] | null = null;

/** The built-in themes, in the order the engine lists them, each with its palette. The colours are read once, from a deck made in each theme. */
export function themeChoices(): ThemeChoice[] {
  if (known) return known;
  try {
    known = builtInThemes().map((name) => {
      const engine = DeckEngine.create("Preview", name, 1);
      const colors = engine.deck.theme.colors;
      engine.dispose();
      return { name, colors };
    });
    return known;
  } catch {
    // The engine is not loaded (a page that has not opened a deck): names only.
    return FALLBACK.map((name) => ({ name, colors: null }));
  }
}
