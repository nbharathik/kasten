// The View sub-menus, shared by the menu bar and the zoom button in the toolbar.

import type { CommandContext } from "../commands/index.ts";
import { type Row, commandItem, plainItem } from "./build.ts";

/** The zoom levels the menus offer besides "Fit" and 100%. */
const LEVELS = [0.5, 0.75, 1.25, 1.5, 2];

const near = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** What the zoom button says: "Fit", or the percentage. */
export function zoomText(zoom: "fit" | number): string {
  return zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`;
}

/** Fit, 50% to 200%, with the one in use checked. */
export function zoomItems(ctx: CommandContext): Row[] {
  const now = ctx.ui.state.zoom;
  const level = (z: number) => plainItem(`zoom-${z}`, zoomText(z), () => ctx.ui.setZoom(z), { checked: typeof now === "number" && near(now, z) });
  return [
    commandItem("view.zoom-fit", ctx, { label: "Fit", icon: null, checked: now === "fit" }),
    level(0.5),
    level(0.75),
    commandItem("view.zoom-100", ctx, { icon: null, checked: typeof now === "number" && near(now, 1) }),
    ...LEVELS.filter((z) => z > 1).map(level),
  ];
}

/** The slide editor, the outline and the grid. */
export const viewModeItems = (ctx: CommandContext): Row[] => ["view.edit", "view.outline", "view.grid"].map((id) => commandItem(id, ctx));
