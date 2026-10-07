// The nine menus of the menu bar, File to Help. Each is built when it is
// opened, from the command list and the sub-menus in the items-* modules.

import { type CommandContext, textFormat } from "../commands/index.ts";
import type { MenuItem } from "../ui/Menu.tsx";
import { SEPARATOR, commandItem, groups, submenu } from "./build.ts";
import { historyLabel } from "./history-label.ts";
import { alignHorizontalItems, alignVerticalItems, distributeItems, orderItems, rotateItems } from "./items-arrange.ts";
import { compositeItems, imageItems, lineItems, shapeGroupItems } from "./items-insert.tsx";
import { moveSlideItems, stepItems } from "./items-slide.ts";
import { alignItems, indentItems, listItems, markItems, spacingItems } from "./items-text.ts";
import { viewModeItems, zoomItems } from "./items-view.ts";

export interface BarMenu {
  id: string;
  label: string;
  /** The rows, built from the state as it is now. */
  items(): MenuItem[];
}

const EXPORTS = ["pptx", "pdf", "png", "markdown", "html"];

function fileItems(ctx: CommandContext): MenuItem[] {
  const { exportAs, print } = ctx.ui.actions;
  return groups(
    [commandItem("slide.new", ctx), commandItem("slide.duplicate", ctx)],
    [commandItem("file.import-pptx", ctx)],
    [submenu("download", "Download", EXPORTS.map((format) => commandItem(`file.export-${format}`, ctx, { disabledIf: !exportAs })), "download")],
    [commandItem("file.print", ctx, { disabledIf: !print })],
  );
}

/** Copy, cut and paste act on the words when a text box is open, and on the elements otherwise. */
function clipboardItems(ctx: CommandContext): MenuItem[] {
  const text = ctx.ui.state.text;
  if (!text) return [commandItem("edit.cut", ctx), commandItem("edit.copy", ctx), commandItem("edit.paste", ctx)];
  const word = (kind: "cut" | "copy") => () => void document.execCommand(kind);
  return [
    commandItem("edit.cut", ctx, { run: word("cut") }),
    commandItem("edit.copy", ctx, { run: word("copy") }),
    commandItem("edit.paste", ctx, { run: () => void navigator.clipboard?.readText().then((words) => words && text.insertText(words), () => {}) }),
  ];
}

function editItems(ctx: CommandContext): MenuItem[] {
  const { undoLabel, redoLabel } = ctx.session.state;
  const text = ctx.ui.state.text;
  return groups(
    [commandItem("edit.undo", ctx, { label: historyLabel("Undo", undoLabel) }), commandItem("edit.redo", ctx, { label: historyLabel("Redo", redoLabel) })],
    clipboardItems(ctx),
    [
      commandItem("edit.duplicate", ctx, { disabledIf: text !== null }),
      commandItem("edit.delete", ctx, { disabledIf: text !== null }),
      commandItem("edit.select-all", ctx),
    ],
    [commandItem("edit.find", ctx)],
  );
}

function viewItems(ctx: CommandContext): MenuItem[] {
  const { present } = ctx.ui.actions;
  return groups(
    [submenu("zoom", "Zoom", zoomItems(ctx), "zoom-in"), submenu("views", "Views", viewModeItems(ctx), "presentation")],
    ["view.notes", "view.filmstrip", "view.snap", "lint.badges"].map((id) => commandItem(id, ctx)),
    ["view.format-panel", "view.steps-panel", "view.ai-panel"].map((id) => commandItem(id, ctx)),
    [commandItem("view.full-screen", ctx)],
    [commandItem("view.present", ctx, { disabledIf: !present }), commandItem("view.present-start", ctx, { disabledIf: !present })],
    [commandItem("view.presenter", ctx, { disabledIf: !present }), commandItem("view.present-scroll", ctx, { disabledIf: !present })],
  );
}

function insertItems(ctx: CommandContext): MenuItem[] {
  return groups(
    [
      commandItem("insert.text-box", ctx, { checked: ctx.session.state.tool === "text" }),
      submenu("image", "Image", imageItems(ctx), "image"),
      submenu("shape", "Shape", shapeGroupItems(ctx), "shapes"),
      submenu("line", "Line", lineItems(ctx), "arrow-up-right"),
      commandItem("insert.table", ctx),
    ],
    compositeItems(ctx),
    [commandItem("slide.new", ctx)],
    [commandItem("insert.palette", ctx)],
  );
}

function formatItems(ctx: CommandContext): MenuItem[] {
  const disabledIf = !textFormat.canFormat(ctx);
  return groups(
    [
      submenu("text", "Text", markItems(ctx), "type"),
      submenu("align", "Align & indent", [...alignItems(ctx), SEPARATOR, ...indentItems(ctx)], "text-align-start"),
      ...listItems(ctx),
      submenu("spacing", "Line spacing", spacingItems(ctx), "list-chevrons-up-down"),
    ],
    [commandItem("text.clear", ctx, { disabledIf }), commandItem("text.link", ctx, { disabledIf })],
  );
}

function slideItems(ctx: CommandContext): MenuItem[] {
  return groups(
    [commandItem("slide.new", ctx), commandItem("slide.duplicate", ctx), commandItem("slide.delete", ctx)],
    [commandItem("slide.skip", ctx), commandItem("slide.backup", ctx), submenu("move", "Move slide", moveSlideItems(ctx), "arrow-up")],
    [submenu("steps", "Steps", stepItems(ctx), "list")],
    ["slide.layout", "slide.background", "slide.transition", "slide.theme"].map((id) => commandItem(id, ctx)),
  );
}

function arrangeItems(ctx: CommandContext): MenuItem[] {
  return groups(
    [
      submenu("order", "Order", orderItems(ctx), "bring-to-front"),
      submenu("align-h", "Align horizontally", alignHorizontalItems(ctx), "align-center-vertical"),
      submenu("align-v", "Align vertically", alignVerticalItems(ctx), "align-center-horizontal"),
      submenu("distribute", "Distribute", distributeItems(ctx), "align-horizontal-distribute-center"),
      submenu("rotate", "Rotate", rotateItems(ctx), "rotate-cw"),
    ],
    ["arrange.group", "arrange.ungroup", "arrange.ungroup-composite", "arrange.lock"].map((id) => commandItem(id, ctx)),
  );
}

/** The menus in the order of the bar. */
export function barMenus(ctx: CommandContext): BarMenu[] {
  return [
    { id: "file", label: "File", items: () => fileItems(ctx) },
    { id: "edit", label: "Edit", items: () => editItems(ctx) },
    { id: "view", label: "View", items: () => viewItems(ctx) },
    { id: "insert", label: "Insert", items: () => insertItems(ctx) },
    { id: "format", label: "Format", items: () => formatItems(ctx) },
    { id: "slide", label: "Slide", items: () => slideItems(ctx) },
    { id: "arrange", label: "Arrange", items: () => arrangeItems(ctx) },
    { id: "tools", label: "Tools", items: () => [commandItem("edit.find", ctx), commandItem("lint.open", ctx), commandItem("agent.accept-all", ctx)] },
    { id: "help", label: "Help", items: () => [commandItem("help.shortcuts", ctx)] },
  ];
}
