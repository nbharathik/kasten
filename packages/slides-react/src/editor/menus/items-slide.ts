// The Slide sub-menus, shared by the menu bar and the right-click menu in the filmstrip.

import type { CommandContext } from "../commands/index.ts";
import { type Row, commandItem } from "./build.ts";

/** Move the slide up, down, to the beginning, to the end. */
export const moveSlideItems = (ctx: CommandContext): Row[] => ["slide.up", "slide.down", "slide.to-start", "slide.to-end"].map((id) => commandItem(id, ctx));

/** The Steps sub-menu of the Slide menu: the builds, and stepping through the slide on the canvas. */
export const stepItems = (ctx: CommandContext): Row[] => [
  commandItem("steps.reveal", ctx, { label: "Reveal one by one" }),
  commandItem("steps.walkthrough", ctx, { label: "Walk through" }),
  commandItem("steps.spotlight", ctx, { label: "Spotlight" }),
  commandItem("steps.clear", ctx, { label: "Clear steps" }),
  commandItem("steps.next", ctx),
  commandItem("steps.previous", ctx),
  commandItem("view.steps-panel", ctx),
];
