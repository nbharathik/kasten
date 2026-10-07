import type { Theme } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { COLOR_TOKENS, type ColorToken, hexOf } from "../../theme/index.ts";
import { ColorButton } from "../panels/format/controls.tsx";
import type { EditorSession } from "../session/session.ts";
import { editTheme } from "./theme-edit.ts";

const NAMES: Record<ColorToken, string> = {
  text1: "Text 1",
  text2: "Text 2",
  bg1: "Background 1",
  bg2: "Background 2",
  accent1: "Accent 1",
  accent2: "Accent 2",
  accent3: "Accent 3",
  accent4: "Accent 4",
  accent5: "Accent 5",
  accent6: "Accent 6",
};

/** The ten colours of the theme. Each opens the palette; what is picked is written as `#rrggbb`, which is all a theme holds. */
export function ThemeColors({ session, theme }: { session: EditorSession; theme: Theme }): JSX.Element {
  return (
    <div className="ks-dg-colors">
      {COLOR_TOKENS.map((token) => (
        <div key={token} className="ks-dg-color">
          <span className="ks-sp-label">{NAMES[token]}</span>
          <ColorButton
            theme={theme}
            label={NAMES[token]}
            value={theme.colors[token]}
            noneLabel="Keep this colour"
            onPick={(picked) => {
              // A theme colour picked from the palette stands for its own hex value here.
              const hex = picked === null ? null : hexOf(theme, picked);
              if (hex !== null && hex !== theme.colors[token].toLowerCase()) editTheme(session, { colors: { [token]: hex } });
            }}
          />
        </div>
      ))}
    </div>
  );
}
