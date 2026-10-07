// The change the preview's chat makes to a slide, since no model answers there: the words of the elements the person
// selected, made shorter by fixed rules. What the app's model decides, this decides; everything after that is the real
// thing: the engine's own operations make the change, its own lint checks the deck, and the deck tools' marks (the
// slide's `x-agent` field, see docs/slides-format.md) go on what changed.

import { DeckEngine, type AgentBatch, type Deck, type Element, type Paragraph, type Text, loadSlides } from "@kasten-slides/wasm";

/** Words the rules take out. */
const FILLER = /\b(?:very|really|just|quite|basically|actually|simply|in fact|of course)\s+/gi;

const wordsOf = (paragraph: Paragraph): string => paragraph.runs.map((run) => run.t).join("");

/** A line made shorter: filler out, the first clause of a long line, no full stop. Short lines are left as they are. */
export function tighten(line: string): string {
  let words = line
    .replace(FILLER, "")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\ba lot of\b/gi, "many")
    .trim();
  if (words.split(/\s+/).length > 6) words = words.split(/\s*[;:—]\s*/)[0]!.trim();
  words = words.replace(/[.;,]+$/, "");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What one change to a slide comes to. */
export interface Plan {
  slide: string;
  /** Its place in the deck, from 1, and its title. */
  number: number;
  title: string;
  /** The `patch_elements` patches, one for each element with a line made shorter. */
  patches: { id: string; patch: { text: { paragraphs: Paragraph[] } } }[];
  /** How many lines change. */
  lines: number;
}

const textOf = (element: Element): Text | undefined => (element as { text?: Text }).text ?? undefined;

/** The title of a slide: the words of its title slot, else of its first element with words. */
export function titleOf(deck: Deck, slideId: string): string {
  const slide = deck.slides.find((s) => s.id === slideId);
  const words = (element: Element) => {
    const text = textOf(element);
    return text ? text.paragraphs.map(wordsOf).join(" ").replace(/\s+/g, " ").trim() : "";
  };
  const titled = slide?.elements.find((e) => e.placeholder === "title" && words(e));
  const any = slide?.elements.find((e) => words(e));
  const found = titled ?? any;
  return found ? words(found) : (slide?.layout ?? "");
}

/**
 * The words to make shorter: those of the elements the person selected; without a selection, of the slide's
 * body slots. Null when the slide is not in the deck.
 */
export function plan(deck: Deck, slideId: string, selected: readonly string[]): Plan | null {
  const at = deck.slides.findIndex((s) => s.id === slideId);
  if (at < 0) return null;
  const slide = deck.slides[at]!;
  const chosen = selected.length > 0 ? slide.elements.filter((e) => selected.includes(e.id)) : slide.elements.filter((e) => e.placeholder === "body" || e.placeholder === "body2");
  const result: Plan = { slide: slideId, number: at + 1, title: titleOf(deck, slideId), patches: [], lines: 0 };
  for (const element of chosen) {
    const text = textOf(element);
    if (!text) continue;
    let changed = 0;
    const paragraphs = text.paragraphs.map((paragraph) => {
      const before = wordsOf(paragraph);
      const after = tighten(before);
      if (!after || after === before) return paragraph;
      changed += 1;
      // The first run's look is kept for the new words.
      return { ...paragraph, runs: [{ ...paragraph.runs[0], t: after }] };
    });
    if (changed > 0) {
      result.patches.push({ id: element.id, patch: { text: { paragraphs } } });
      result.lines += changed;
    }
  }
  return result;
}

/** Who made a change and when: the deck tools' author. */
export interface Author {
  by: string;
  session: string;
  at: number;
}

/**
 * The deck tools' marks: `ids` of `slide` are the author's work now. The engine took the marks off what its operations
 * changed; this puts the elements in the author's batch of the slide (a batch for each author and session).
 */
export function markWork(deck: Record<string, unknown>, slide: string, ids: readonly string[], author: Author): void {
  const slides = deck.slides as Record<string, unknown>[];
  const target = slides.find((s) => s.id === slide);
  if (!target || ids.length === 0) return;
  const batches = ((target["x-agent"] as AgentBatch[] | undefined) ?? []).map((b) => ({ ...b, ids: b.ids.filter((id) => !ids.includes(id)) })).filter((b) => b.ids.length > 0);
  const own = batches.find((b) => b.by === author.by && b.session === author.session);
  if (own) {
    own.ids.push(...ids);
    own.at = author.at;
  } else batches.push({ at: author.at, by: author.by, ids: [...ids], session: author.session });
  target["x-agent"] = batches;
}

/** JSON as the deck file is written: keys in order, two spaces, a line end at the end. */
export function canonical(value: unknown): string {
  const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sorted(x)])) : v);
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

/** What lint found in a deck: the counts of its errors and warnings. */
export interface Checked {
  errors: number;
  warnings: number;
}

/** Changes the deck with the plan and marks the work as the author's; the new text and the elements that changed. */
export async function change(text: string, made: Plan, author: Author): Promise<{ text: string; ids: string[] }> {
  await loadSlides();
  const engine = DeckEngine.open(text);
  try {
    engine.apply("patch_elements", { slide: made.slide, patches: made.patches });
    const saved = JSON.parse(engine.save()) as Record<string, unknown>;
    const ids = made.patches.map((p) => p.id);
    markWork(saved, made.slide, ids, author);
    return { text: canonical(saved), ids };
  } finally {
    engine.dispose();
  }
}

/** Lint on a deck's text, as `lint_deck` counts it. */
export async function check(text: string): Promise<Checked> {
  await loadSlides();
  const engine = DeckEngine.open(text);
  try {
    const { issues } = engine.lintDeck();
    return { errors: issues.filter((i) => i.severity === "error").length, warnings: issues.filter((i) => i.severity === "warning").length };
  } finally {
    engine.dispose();
  }
}

/** The deck as the engine reads it. */
export async function read(text: string): Promise<Deck> {
  await loadSlides();
  const engine = DeckEngine.open(text);
  try {
    return engine.deck;
  } finally {
    engine.dispose();
  }
}
