import type { Theme } from "@kasten-slides/wasm";
import { useState } from "react";

import { COLOR_TOKENS, colorOf, hexOf } from "../../theme/index.ts";

interface ColorPickerProps {
  theme: Theme;
  /** A theme token, a `#rrggbb` value, or null for none. */
  value: string | null;
  /** A token, a hex value, or null for "none" (or the default, when `noneLabel` says so). */
  onPick(value: string | null): void;
  noneLabel?: string;
}

/** Mixes a `#rrggbb` toward white (positive `by`) or black (negative). */
export function shade(hex: string, by: number): string {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const mixed = by >= 0 ? c + (255 - c) * by : c * (1 + by);
    return Math.round(mixed).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** A hue for each column of the standard row, as Google Slides offers. */
const STANDARD = ["#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"];
/** How far each row below the base colours is mixed toward white or black. */
const ROWS = [0.8, 0.6, 0.4, -0.25, -0.5];

const HEX = /^#[0-9a-f]{6}$/i;

/** The palette that opens from a colour button: the theme's colours and their shades, then standard colours, then any hex value. */
export function ColorPicker({ theme, value, onPick, noneLabel = "None" }: ColorPickerProps) {
  const [custom, setCustom] = useState("");
  const current = value === null ? null : (hexOf(theme, value) ?? value);
  const swatch = (colour: string, pick: string, name: string, key: string) => (
    <button
      key={key}
      type="button"
      className={`ks-swatch${current !== null && hexOf(theme, pick) === current ? " is-on" : ""}`}
      style={{ background: colour }}
      aria-label={name}
      data-tip={name}
      onClick={() => onPick(pick)}
    />
  );
  const themed = COLOR_TOKENS.map((token) => ({ token, hex: hexOf(theme, token) ?? "#000000" }));
  return (
    <div className="ks-colors">
      <button type="button" className="ks-color-none" onClick={() => onPick(null)}>
        <span className="ks-swatch is-none" aria-hidden="true" />
        {noneLabel}
      </button>
      <div className="ks-swatch-grid" aria-label="Theme colours">
        {themed.map(({ token }) => swatch(colorOf(theme, token), token, token, token))}
        {ROWS.flatMap((by) => themed.map(({ token, hex }) => swatch(shade(hex, by), shade(hex, by), `${token} ${by > 0 ? "lighter" : "darker"}`, `${token}${by}`)))}
      </div>
      <div className="ks-swatch-grid" aria-label="Standard colours">
        {STANDARD.map((hex) => swatch(hex, hex, hex, hex))}
      </div>
      <form
        className="ks-color-custom"
        onSubmit={(event) => {
          event.preventDefault();
          const hex = custom.startsWith("#") ? custom : `#${custom}`;
          if (HEX.test(hex)) onPick(hex.toLowerCase());
        }}
      >
        <input className="ks-input" value={custom} placeholder="#1a73e8" aria-label="Colour as hex" onChange={(event) => setCustom(event.target.value)} />
        <button type="submit" className="ks-btn ks-text-btn" disabled={!HEX.test(custom.startsWith("#") ? custom : `#${custom}`)}>
          Use
        </button>
      </form>
    </div>
  );
}
