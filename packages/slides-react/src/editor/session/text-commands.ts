// Formatting the text of whole elements, for when a box is selected but its
// text is not being edited: bold on a selected box makes all of its words bold.
// While text is being edited the text editor does this itself.

import type { Align, Element, ListKind, Paragraph, Run, SetRichText, Text } from "@kasten-slides/wasm";

import type { EditorSession } from "./session.ts";

/** A yes, a no, or a selection that holds both. */
export type Tri = boolean | "mixed";

/** How the selected text looks, for the toolbar. `null` is the style's own value, not overridden. */
export interface FormatState {
  bold: Tri;
  italic: Tri;
  underline: Tri;
  strike: Tri;
  code: Tri;
  color: string | "mixed" | null;
  size: number | "mixed" | null;
  font: string | "mixed" | null;
  align: Align | "mixed";
  list: ListKind | "mixed" | null;
  level: number;
  link: string | "mixed" | null;
  lineSpacing: number | "mixed" | null;
}

function textOf(element: Element): Text | null {
  if (element.type === "text") return element.text;
  if (element.type === "shape") return element.text ?? null;
  if (element.type === "connector") return element.label ?? null;
  return null;
}

/** One value across many, or "mixed" when they differ. */
function agree<T>(values: T[], none: T): T | "mixed" {
  if (values.length === 0) return none;
  return values.every((v) => v === values[0]) ? values[0]! : "mixed";
}

/** The formatting shared by the runs and paragraphs of these texts. */
export function summarize(texts: Text[]): FormatState {
  const paragraphs = texts.flatMap((t) => t.paragraphs);
  const runs = paragraphs.flatMap((p) => p.runs.filter((r) => r.t !== "" || paragraphs.length === 1));
  const flag = (pick: (r: Run) => boolean | undefined): Tri => agree(runs.map((r) => Boolean(pick(r))), false);
  return {
    bold: flag((r) => r.b),
    italic: flag((r) => r.i),
    underline: flag((r) => r.u),
    strike: flag((r) => r.s),
    code: flag((r) => r.code),
    color: agree(runs.map((r) => r.color ?? null), null),
    size: agree(runs.map((r) => r.size ?? null), null),
    font: agree(runs.map((r) => r.font ?? null), null),
    align: agree(paragraphs.map((p) => p.align ?? "left"), "left" as Align),
    list: agree(paragraphs.map((p) => p.list ?? null), null),
    level: Math.max(0, ...paragraphs.map((p) => p.level ?? 0)),
    link: agree(runs.map((r) => r.link ?? null), null),
    lineSpacing: agree(paragraphs.map((p) => p.lineSpacing ?? null), null),
  };
}

export class TextCommands {
  constructor(private readonly s: EditorSession) {}

  private targets(ids: readonly string[]): { element: Element; text: Text }[] {
    return this.s.elements.find(ids).flatMap((element) => {
      const text = textOf(element);
      return text ? [{ element, text }] : [];
    });
  }

  /** How the text of the selected elements looks. */
  state(ids: readonly string[] = this.s.state.selection): FormatState {
    return summarize(this.targets(ids).map((t) => t.text));
  }

  /** Rewrites the text of each target as one step of undo. */
  private rewrite(ids: readonly string[], change: (text: Text) => Text): void {
    const slide = this.s.state.slideId;
    const operations = this.targets(ids).flatMap(({ element, text }) => {
      const next = change(text);
      return JSON.stringify(next) === JSON.stringify(text) ? [] : [["set_rich_text", { slide, id: element.id, text: next }] satisfies ["set_rich_text", SetRichText]];
    });
    if (operations.length > 0) this.s.run(() => this.s.core.applyBatch(operations));
  }

  private eachRun(ids: readonly string[], change: (run: Run) => Run): void {
    this.rewrite(ids, (text) => ({ ...text, paragraphs: text.paragraphs.map((p) => ({ ...p, runs: p.runs.map(change) })) }));
  }

  private eachParagraph(ids: readonly string[], change: (paragraph: Paragraph) => Paragraph): void {
    this.rewrite(ids, (text) => ({ ...text, paragraphs: text.paragraphs.map(change) }));
  }

  /** Sets bold, italic, underline or strike on all the words, or clears it if all had it already. */
  toggle(flag: "b" | "i" | "u" | "s", ids: readonly string[] = this.s.state.selection): void {
    const summary = this.state(ids);
    const on = { b: summary.bold, i: summary.italic, u: summary.underline, s: summary.strike }[flag] !== true;
    this.eachRun(ids, (run) => {
      const { [flag]: _old, ...rest } = run;
      return on ? { ...rest, [flag]: true } : rest;
    });
  }

  /** Sets a run property on all the words; null puts the style's own value back. */
  setRun(key: "color" | "size" | "font" | "link", value: string | number | null, ids: readonly string[] = this.s.state.selection): void {
    this.eachRun(ids, (run) => {
      const { [key]: _old, ...rest } = run;
      return value === null ? rest : { ...rest, [key]: value };
    });
  }

  setAlign(align: Align, ids: readonly string[] = this.s.state.selection): void {
    this.eachParagraph(ids, (p) => ({ ...p, align }));
  }

  /** Makes every paragraph a bulleted or numbered list, or a plain paragraph if all already were that kind. */
  toggleList(kind: ListKind, ids: readonly string[] = this.s.state.selection): void {
    const off = this.state(ids).list === kind;
    this.eachParagraph(ids, (p) => {
      const { list: _list, level: _level, ...rest } = p;
      return off ? rest : { ...rest, list: kind, level: p.level ?? 0 };
    });
  }

  indent(delta: 1 | -1, ids: readonly string[] = this.s.state.selection): void {
    this.eachParagraph(ids, (p) => ({ ...p, level: Math.min(Math.max((p.level ?? 0) + delta, 0), 5) }));
  }

  setLineSpacing(multiple: number | null, ids: readonly string[] = this.s.state.selection): void {
    this.eachParagraph(ids, (p) => {
      const { lineSpacing: _old, ...rest } = p;
      return multiple === null ? rest : { ...rest, lineSpacing: multiple };
    });
  }

  /** Removes bold, colours, sizes and the rest, keeping the words, links and lists. */
  clearFormatting(ids: readonly string[] = this.s.state.selection): void {
    this.eachRun(ids, (run) => (run.link ? { t: run.t, link: run.link } : { t: run.t }));
  }
}
