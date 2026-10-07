import type { Colors } from "@kasten-slides/wasm";

import "./theme-strip.css";

/** The colours a card shows for a theme: paper, ink, and the first accents. */
export function ThemeStrip({ colors }: { colors: Colors | null }) {
  const shown = colors ? [colors.bg1, colors.text1, colors.accent1, colors.accent2, colors.accent3, colors.accent4] : [];
  return (
    <span className="ks-sp-strip" aria-hidden="true">
      {shown.map((colour, i) => (
        <span key={i} style={{ background: colour }} />
      ))}
    </span>
  );
}
