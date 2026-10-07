import type { Theme } from "@kasten-slides/wasm";
import type { JSX, MouseEvent } from "react";

import { colorOf } from "../../theme/index.ts";
import { swallowKeys } from "../menus/focus.ts";
import { useDropdown } from "../menus/useDropdown.ts";
import { ColorPicker } from "../ui/ColorPicker.tsx";
import type { IconName } from "../ui/Icon.tsx";
import { Popover } from "../ui/Popover.tsx";
import { ToolButton } from "./ToolButton.tsx";

/** Presses on the buttons of a popover leave the focus where it is (in the open text box), but a press on a field takes it. */
export function keepFocusExceptFields(event: MouseEvent): void {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
}

interface ColorButtonProps {
  theme: Theme;
  icon: IconName;
  label: string;
  /** The colour to show: a theme token or a hex value; null for none; "mixed" where the selection disagrees. */
  value: string | null;
  mixed?: boolean;
  /** What the first choice of the palette is called: "Automatic" for text, "Transparent" for a fill. */
  noneLabel: string;
  disabled?: boolean;
  onPick(color: string | null): void;
}

/** A button showing a colour as a bar under its icon; it opens the palette. */
export function ColorButton({ theme, icon, label, value, mixed, noneLabel, disabled, onPick }: ColorButtonProps): JSX.Element {
  const dd = useDropdown("dialog");
  const state = mixed ? " is-mixed" : value === null ? " is-none" : "";
  return (
    <>
      <ToolButton icon={icon} label={label} menu disabled={disabled} className="ks-tb-color" {...dd.trigger}>
        <span className={`ks-tb-bar${state}`} style={!mixed && value !== null ? { background: colorOf(theme, value) } : undefined} />
      </ToolButton>
      {dd.anchor ? (
        <Popover anchor={dd.anchor} onClose={dd.close} label={label}>
          <div className="ks-tb-palette" data-ks-keep-focus="" onMouseDown={keepFocusExceptFields} onKeyDown={swallowKeys}>
            <ColorPicker
              theme={theme}
              value={mixed ? null : value}
              noneLabel={noneLabel}
              onPick={(color) => {
                dd.close();
                onPick(color);
              }}
            />
          </div>
        </Popover>
      ) : null}
    </>
  );
}
