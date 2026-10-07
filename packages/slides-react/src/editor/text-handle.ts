import type { Align, ListKind, Text } from "@kasten-slides/wasm";

import type { FormatState } from "./session/text-commands.ts";

/**
 * What the commands need of a text box being edited: the formatting they can
 * apply to the selected words, and how those words look now. The text editor
 * component's handle has all of it.
 */
export interface TextHandle {
  focus(): void;
  getText(): Text;
  selectAll(): void;
  formatState(): FormatState;
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrike(): void;
  toggleCode(): void;
  setColor(color: string | null): void;
  setSize(points: number | null): void;
  stepSize(delta: number): void;
  setFont(family: string | null): void;
  setAlign(align: Align): void;
  toggleList(kind: ListKind): void;
  indent(delta: 1 | -1): void;
  setLineSpacing(multiple: number | null): void;
  setLink(href: string | null): void;
  clearFormatting(): void;
  insertText(text: string): void;
}
