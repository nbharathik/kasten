// The Arrange sub-menus, shared by the menu bar and the right-click menu on an element.

import type { CommandContext } from "../commands/index.ts";
import { type Row, commandItem } from "./build.ts";

/** Bring to front, forward, send backward, to back. */
export const orderItems = (ctx: CommandContext): Row[] => ["front", "forward", "backward", "back"].map((id) => commandItem(`arrange.${id}`, ctx));

export const alignHorizontalItems = (ctx: CommandContext): Row[] => [
  commandItem("arrange.align-left", ctx, { label: "Left" }),
  commandItem("arrange.align-center", ctx, { label: "Centre" }),
  commandItem("arrange.align-right", ctx, { label: "Right" }),
];

export const alignVerticalItems = (ctx: CommandContext): Row[] => [
  commandItem("arrange.align-top", ctx, { label: "Top" }),
  commandItem("arrange.align-middle", ctx, { label: "Middle" }),
  commandItem("arrange.align-bottom", ctx, { label: "Bottom" }),
];

/** Space three or more elements evenly. `short` names them "Horizontally" and "Vertically", for a menu that is already called Distribute. */
export const distributeItems = (ctx: CommandContext, short = true): Row[] => [
  commandItem("arrange.distribute-horizontal", ctx, short ? { label: "Horizontally" } : {}),
  commandItem("arrange.distribute-vertical", ctx, short ? { label: "Vertically" } : {}),
];

/** Turn by a quarter, and mirror. */
export const rotateItems = (ctx: CommandContext): Row[] => [
  commandItem("arrange.rotate-cw", ctx),
  commandItem("arrange.rotate-ccw", ctx, { icon: "rotate-ccw" }),
  commandItem("arrange.flip-horizontal", ctx),
  commandItem("arrange.flip-vertical", ctx),
];
