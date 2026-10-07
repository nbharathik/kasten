// The board colours as a row of swatches: none, then the six JSON Canvas
// presets.

import { PRESETS, colorName, cssColor } from "../colors";

export function ColorSwatches({ value, onPick }: { value: string | null; onPick: (color: string | null) => void }) {
  return (
    <span className="kasten-board-swatches" role="group" aria-label="Colour">
      <button type="button" className="kasten-board-swatch is-none" aria-label="No colour" aria-pressed={!value} title="No colour" onClick={() => onPick(null)} />
      {PRESETS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          className="kasten-board-swatch"
          style={{ background: cssColor(preset.value) }}
          aria-label={colorName(preset.value)}
          aria-pressed={value === preset.value}
          title={preset.name}
          onClick={() => onPick(preset.value)}
        />
      ))}
    </span>
  );
}
