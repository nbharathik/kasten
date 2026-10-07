// What the insert palette lists: things to put on the slide, layouts to add as
// a slide, the pictures the host holds, and every command that can be done now.

import { type CommandContext, COMMANDS, isEnabled, keysOf, runCommand } from "../commands/index.ts";
import { COMPOSITES } from "../composite-kinds.ts";
import { fitted, image, line, shape, textBox } from "../factory.ts";
import type { HostImage } from "../host.ts";
import { freeBox, insertPlaced } from "../insert-composite.ts";
import { LINES, SHAPE_GROUPS, CLICK_SIZE } from "../shapes.ts";
import type { IconName } from "../ui/icons.ts";
import type { Searchable } from "./palette-rank.ts";

/** The sections of the palette, in the order they are listed. */
export const SECTIONS = ["Insert", "Shapes", "Slides", "Images", "Commands"] as const;
export type Section = (typeof SECTIONS)[number];

export interface PaletteItem extends Searchable {
  id: string;
  group: Section;
  icon?: IconName;
  /** A preset shape, drawn small beside the name. */
  shape?: string;
  /** What kind of thing it is, said at the right when no keys are. */
  hint?: string;
  /** The keys that do the same, as they read on this system. */
  keys?: string;
  run(context: CommandContext): void | Promise<void>;
}

const NONE = { x: 0, y: 0, w: 0, h: 0 };

/** What the commands of each family are called in the palette. */
const AREA_NAMES: Record<string, string> = {
  edit: "Edit",
  text: "Text",
  slide: "Slide",
  steps: "Steps",
  arrange: "Arrange",
  view: "View",
  file: "File",
  help: "Help",
  present: "Present",
  lint: "Check",
  import: "Import",
};

const areaOf = (id: string): string => {
  const family = id.split(".")[0] ?? id;
  return AREA_NAMES[family] ?? family.charAt(0).toUpperCase() + family.slice(1);
};

/** What is put on the slide as a thing of its own, apart from the composites: text, a picture, a table. */
function basics(): PaletteItem[] {
  return [
    {
      id: "palette.text-box",
      group: "Insert",
      label: "Text box",
      icon: "type",
      keywords: ["words", "paragraph", "write"],
      run: ({ session }) => {
        const id = insertPlaced(session, textBox(NONE, ""), CLICK_SIZE.text);
        if (id) session.startEditing(id);
      },
    },
    { id: "palette.image", group: "Insert", label: "Image from computer…", icon: "image", keywords: ["picture", "photo", "upload"], run: (context) => runCommand("insert.image", context) },
    { id: "palette.gallery", group: "Insert", label: "Image from the gallery…", icon: "image-plus", keywords: ["picture", "photo"], run: (context) => runCommand("insert.gallery", context) },
    { id: "palette.table", group: "Insert", label: "Table…", icon: "table", keywords: ["grid", "rows", "columns", "cells"], run: (context) => runCommand("insert.table", context) },
  ];
}

const composites = (): PaletteItem[] =>
  COMPOSITES.map((spec) => ({
    id: `palette.${spec.kind}`,
    group: "Insert",
    label: spec.label,
    icon: spec.icon,
    keywords: spec.keywords,
    run: (context) => runCommand(`insert.${spec.kind}`, context),
  }));

/** Every preset shape and every kind of line, put on the slide where there is room. */
function shapes(): PaletteItem[] {
  const presets = SHAPE_GROUPS.flatMap((group) =>
    group.shapes.map(
      (entry): PaletteItem => ({
        id: `palette.shape.${entry.preset}`,
        group: "Shapes",
        label: entry.label,
        shape: entry.preset,
        hint: group.title === "Shapes" ? "Shape" : group.title.replace(/s$/, ""),
        keywords: ["shape"],
        run: ({ session }) => void insertPlaced(session, shape(entry.preset, NONE), CLICK_SIZE.shape),
      }),
    ),
  );
  const lines = LINES.map(
    (entry): PaletteItem => ({
      id: `palette.${entry.tool}`,
      group: "Shapes",
      label: entry.label,
      icon: "arrow-up-right",
      hint: "Line",
      keywords: ["line", "connector", "arrow"],
      run: ({ session }) => {
        const [kind, route] = entry.tool.split(":") as ["line" | "arrow", "straight" | "elbow" | "curved"];
        // Across the middle of the free place, left to right.
        const box = freeBox(session, { w: 240, h: 60 });
        const y = box.y + box.h / 2;
        session.elements.insert([line(route, kind === "arrow", { x: box.x, y }, { x: box.x + box.w, y })]);
      },
    }),
  );
  return [...presets, ...lines];
}

/** A new slide on each layout of the theme. */
const slides = ({ session }: CommandContext): PaletteItem[] =>
  session.deck.theme.layouts.map((layout) => ({
    id: `palette.slide.${layout.name}`,
    group: "Slides",
    label: `New slide: ${layout.label}`,
    icon: "layout-template",
    keywords: ["add", "layout"],
    run: () => void session.slides.add({ layout: layout.name }),
  }));

/** The pictures the host holds, each placed on the slide at a size that suits it. */
const pictures = (images: readonly HostImage[]): PaletteItem[] =>
  images.map((held) => ({
    id: `palette.image.${held.path}`,
    group: "Images",
    label: `Image: ${held.name}`,
    icon: "image",
    keywords: ["picture", "gallery"],
    run: ({ session }) => {
      const size = fitted({ w: held.width ?? 640, h: held.height ?? 400 }, session.deck.size);
      insertPlaced(session, image(held.path, NONE, held.name.replace(/\.[^.]+$/, "")), size);
    },
  }));

/** Every command that can be done now, apart from the ones that insert, which the palette does in its own way. */
function commands(context: CommandContext): PaletteItem[] {
  return [...COMMANDS.values()]
    .filter((command) => !command.id.startsWith("insert.") && isEnabled(command, context))
    .map((command) => {
      const keys = keysOf(command.id);
      return {
        id: command.id,
        group: "Commands" as const,
        label: command.label,
        ...(command.icon ? { icon: command.icon } : {}),
        hint: areaOf(command.id),
        ...(keys ? { keys } : {}),
        run: (ctx: CommandContext) => runCommand(command.id, ctx),
      };
    });
}

/** The whole list of the palette for this editor, in the order of its sections. */
export function paletteItems(context: CommandContext, held: readonly HostImage[] = []): PaletteItem[] {
  return [...basics(), ...composites(), ...shapes(), ...slides(context), ...pictures(held), ...commands(context)];
}
