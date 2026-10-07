// What a right click offers: on an element, on the empty slide, and on a slide in the filmstrip.

import { ungroupable } from "../commands/composites.ts";
import { type CommandContext, commandOf } from "../commands/index.ts";
import type { ContextMenuState } from "../ui-state.ts";
import type { MenuItem } from "../ui/Menu.tsx";
import { SEPARATOR, commandItem, groups, plainItem, submenu } from "./build.ts";
import { alignHorizontalItems, alignVerticalItems, distributeItems, orderItems, rotateItems } from "./items-arrange.ts";
import { moveSlideItems } from "./items-slide.ts";

/** What the menu offers for an assistant's work: accept the selected elements that are marked, and all of it when any of the deck is. */
function acceptItems(ctx: CommandContext): MenuItem[] {
  const { session } = ctx;
  const selected = session.marks.selected.length;
  return [
    ...(selected > 0 ? [commandItem("agent.accept", ctx, { label: selected === 1 ? "Accept" : `Accept ${selected} elements` })] : []),
    ...(session.marks.pending > selected ? [commandItem("agent.accept-all", ctx)] : []),
  ];
}

function elementItems(ctx: CommandContext): MenuItem[] {
  const { session, ui } = ctx;
  const picked = session.elements.find();
  const only = picked.length === 1 ? picked[0] : undefined;
  const hasGroup = picked.some((element) => element.type === "group");
  const locked = commandOf("arrange.lock").checked?.(session.state, ui.state) === true;
  return groups(
    acceptItems(ctx),
    ["edit.cut", "edit.copy", "edit.paste", "edit.duplicate", "edit.delete"].map((id) => commandItem(id, ctx)),
    [
      submenu("order", "Order", orderItems(ctx), "bring-to-front"),
      ...(picked.length > 1
        ? [submenu("align", "Align", [...alignHorizontalItems(ctx), SEPARATOR, ...alignVerticalItems(ctx), SEPARATOR, ...distributeItems(ctx, false)], "align-center-vertical")]
        : []),
      submenu("rotate", "Rotate & flip", rotateItems(ctx), "rotate-cw"),
      ...(picked.length > 1 || !hasGroup ? [commandItem("arrange.group", ctx)] : []),
      ...(hasGroup ? [commandItem("arrange.ungroup", ctx)] : []),
      ...(picked.some(ungroupable) ? [commandItem("arrange.ungroup-composite", ctx)] : []),
      commandItem("arrange.lock", ctx, { label: locked ? "Unlock" : "Lock", icon: locked ? "lock-open" : "lock", checked: null }),
    ],
    [
      commandItem("view.format-panel", ctx, { label: "Format options", checked: null, run: () => ui.openPanel("format") }),
      ...(only && (only.type === "text" || only.type === "shape") ? [plainItem("edit-text", "Edit text", () => session.startEditing(only.id), { icon: "text-cursor-input" })] : []),
      commandItem("text.link", ctx, { label: "Link…" }),
    ],
  );
}

const canvasItems = (ctx: CommandContext): MenuItem[] =>
  groups(
    acceptItems(ctx),
    [commandItem("edit.paste", ctx), commandItem("edit.select-all", ctx)],
    [commandItem("slide.layout", ctx), commandItem("slide.background", ctx)],
    [commandItem("view.notes", ctx), commandItem("view.snap", ctx)],
  );

const slideItems = (ctx: CommandContext): MenuItem[] =>
  groups(
    ctx.session.marks.pending > 0 ? [commandItem("agent.accept-all", ctx)] : [],
    [commandItem("slide.new", ctx), commandItem("slide.duplicate", ctx), commandItem("slide.delete", ctx)],
    [commandItem("edit.select-all", ctx, { label: "Select all slides" })],
    [commandItem("slide.skip", ctx), commandItem("slide.backup", ctx)],
    [submenu("move", "Move slide", moveSlideItems(ctx), "arrow-up"), commandItem("slide.layout", ctx), commandItem("slide.background", ctx)],
    [commandItem("slide.add-section", ctx), commandItem("slide.rename-section", ctx), commandItem("slide.remove-section", ctx)],
  );

/** The rows of the context menu for `kind`. */
export function contextItems(kind: ContextMenuState["kind"], ctx: CommandContext): MenuItem[] {
  if (kind === "element") return elementItems(ctx);
  return kind === "canvas" ? canvasItems(ctx) : slideItems(ctx);
}
