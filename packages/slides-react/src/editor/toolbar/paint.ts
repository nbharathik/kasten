// The paint format brush: pick up how the words and the box in hand look, then
// lay that on the next thing clicked. What was picked up lives in `ui.paint`;
// putting it down is done here, by watching for the selection to move.

import type { Element, Run, Text } from "@kasten-slides/wasm";
import { useEffect } from "react";

import type { CommandContext } from "../commands/index.ts";
import { shownFormat } from "../menus/format-view.ts";
import type { Patch } from "../session/elements.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi, PaintFormat } from "../ui-state.ts";

/** The looks of a box that the brush copies. */
const STYLE_KEYS = ["fill", "stroke", "radius", "shadow", "opacity", "startArrow", "endArrow"] as const;
/** Arrowheads are only for lines. */
const ARROW_KEYS: readonly string[] = ["startArrow", "endArrow"];
/** The elements that have a look of their own to copy or to take. */
const STYLED = new Set<Element["type"]>(["shape", "text", "line", "connector"]);
const HEADED = new Set<Element["type"]>(["line", "connector"]);

const textOf = (element: Element): Text | null => (element.type === "text" ? element.text : element.type === "shape" ? (element.text ?? null) : null);

/** A yes or a no; undefined where the selection holds both. */
const flag = (value: boolean | "mixed"): boolean | undefined => (value === "mixed" ? undefined : value);

/**
 * How the words and the box in hand look: the text being edited, else the
 * selected elements. Null when nothing is selected or open.
 */
export function capturePaint(ctx: CommandContext): PaintFormat | null {
  const { session, ui } = ctx;
  const picked = session.elements.find();
  const source = session.elements.find(session.state.editing ? [session.state.editing] : picked.slice(0, 1).map((e) => e.id))[0];
  if (!source && !ui.state.text) return null;

  const run: PaintFormat["run"] = {};
  if (ui.state.text !== null || picked.some((e) => textOf(e) !== null)) {
    const format = shownFormat(ctx);
    for (const [key, value] of [["b", flag(format.bold)], ["i", flag(format.italic)], ["u", flag(format.underline)], ["s", flag(format.strike)]] as const) {
      if (value !== undefined) run[key] = value;
    }
    if (typeof format.color === "string" && format.color !== "mixed") run.color = format.color;
    if (typeof format.size === "number") run.size = format.size;
    if (typeof format.font === "string" && format.font !== "mixed") run.font = format.font;
  }

  if (!source || !STYLED.has(source.type)) return { run };
  const style: Record<string, unknown> = {};
  for (const key of STYLE_KEYS) {
    const value = source.style?.[key];
    if (value != null) style[key] = structuredClone(value);
  }
  return { run, style };
}

/** The runs with what the brush carries laid over: a flag it lacks is taken off, colour, size and font it lacks go back to the text style's. */
function paintText(text: Text, run: PaintFormat["run"]): Text {
  const paint = (old: Run): Run => {
    const { b, i, u, s, color: _color, size: _size, font: _font, ...rest } = old;
    const keep = (name: "b" | "i" | "u" | "s", was: boolean | undefined) => {
      const now = run[name] === undefined ? was : run[name];
      return now ? { [name]: true } : {};
    };
    return {
      ...rest,
      ...keep("b", b),
      ...keep("i", i),
      ...keep("u", u),
      ...keep("s", s),
      ...(run.color ? { color: run.color } : {}),
      ...(run.size ? { size: run.size } : {}),
      ...(run.font ? { font: run.font } : {}),
    };
  };
  return { ...text, paragraphs: text.paragraphs.map((p) => ({ ...p, runs: p.runs.map(paint) })) };
}

/**
 * What to send so that `have` becomes `want`. A merge patch merges an object
 * into the one that is there, so the keys `have` has and `want` has not are
 * sent as null, to be taken off.
 */
function replacing(want: Patch[string], have: Patch[string]): Patch[string] {
  if (want === null || typeof want !== "object" || Array.isArray(want) || have === null || typeof have !== "object" || Array.isArray(have)) return want;
  const gone = Object.keys(have).filter((key) => !(key in want));
  return { ...want, ...Object.fromEntries(gone.map((key) => [key, null])) };
}

/** Lays the brush's look on the elements: one change for each, so one step of undo for each. */
export function applyPaint(session: EditorSession, paint: PaintFormat, ids: readonly string[]): void {
  const brushText = Object.keys(paint.run).length > 0;
  for (const element of session.elements.find(ids)) {
    const patch: Patch = {};
    const text = textOf(element);
    if (brushText && text) {
      const painted = paintText(text, paint.run);
      if (JSON.stringify(painted) !== JSON.stringify(text)) patch.text = painted as unknown as Patch;
    }
    if (paint.style && STYLED.has(element.type)) {
      const change: Patch = {};
      for (const key of STYLE_KEYS) {
        if (ARROW_KEYS.includes(key) && !HEADED.has(element.type)) continue;
        const want = (paint.style[key] ?? null) as Patch[string];
        const have = (element.style?.[key] ?? null) as Patch[string];
        if (JSON.stringify(want) !== JSON.stringify(have)) change[key] = replacing(want, have);
      }
      if (Object.keys(change).length > 0) patch.style = change;
    }
    if (Object.keys(patch).length > 0) session.elements.patch(patch, [element.id]);
  }
}

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Puts the brush down. While `ui.paint` is set, the next time the selection
 * moves to something else, the brush is laid on it and put away. Escape puts
 * it away without laying it anywhere.
 */
export function usePaintBrush(session: EditorSession, ui: EditorUi): void {
  useEffect(() => {
    /** What was selected when the brush picked its look up. */
    let from: readonly string[] | null = ui.state.paint ? [...session.state.selection] : null;
    const watch = () => {
      const brush = ui.state.paint;
      if (!brush) {
        from = null;
        return;
      }
      if (from === null) {
        from = [...session.state.selection];
        return;
      }
      const now = session.state.selection;
      if (now.length === 0 || sameIds(now, from)) return;
      from = null;
      ui.setPaint(null);
      applyPaint(session, brush, now);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !ui.state.paint) return;
      event.stopPropagation();
      ui.setPaint(null);
    };
    const stopSession = session.subscribe(watch);
    const stopUi = ui.subscribe(watch);
    document.addEventListener("keydown", escape, true);
    return () => {
      stopSession();
      stopUi();
      document.removeEventListener("keydown", escape, true);
    };
  }, [session, ui]);
}
