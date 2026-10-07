// What a proposal does to a deck, slide by slide. A deck proposal carries the
// deck as it was and as the change leaves it (the core keeps both in the op:
// `edit_deck` has `base` and `text`, `create_deck` has `text`, and a deck for
// the trash is the proposal's `before`), and the review draws the slides that
// differ as before-and-after thumbnails. This reads the two versions; drawing
// them is DeckChange.tsx, which loads the slides code only when it is shown.

import type { Deck, Slide } from "@kasten-slides/wasm";

import type { Proposal } from "../../../lib/vault/types";

/** A slide of one version of a deck, with its place in it (from 1). */
export interface Placed {
  slide: Slide;
  number: number;
}

export interface SlideChange {
  kind: "added" | "removed" | "changed";
  id: string;
  /** What to call the slide: its title as it is now, or as it was for one that goes. */
  title: string;
  before: Placed | null;
  after: Placed | null;
}

export interface DeckDelta {
  /** In the order they appear: the later version's slides, and where a removed slide stood. */
  changes: SlideChange[];
  /** The slides both versions have are in another order. */
  reordered: boolean;
  /** Something outside the slides differs: the theme, the size, the title, the sections. */
  settings: boolean;
  slidesBefore: number;
  slidesAfter: number;
}

/** The deck of a proposal as text before and after the change: none before a new deck, none after one for the trash. */
export interface DeckTexts {
  before: string | null;
  after: string | null;
}

const LONGEST_TITLE = 60;

/** The plain words of an element's text, paragraph after paragraph. */
function wordsOf(element: unknown): string {
  const text = (element as { text?: { paragraphs?: { runs?: { t?: unknown }[] }[] } } | null)?.text;
  const lines = (text?.paragraphs ?? []).map((paragraph) => (paragraph.runs ?? []).map((run) => (typeof run.t === "string" ? run.t : "")).join(""));
  return lines.join(" ").split(/\s+/).filter(Boolean).join(" ");
}

/** A slide's name: its title slot, else its first words, else its layout. */
export function slideTitle(slide: Slide): string {
  const elements = (slide.elements ?? []) as unknown as { placeholder?: string | null }[];
  const words = elements.filter((e) => e.placeholder === "title").map(wordsOf).find(Boolean) ?? elements.map(wordsOf).find(Boolean) ?? slide.layout ?? "slide";
  return words.length > LONGEST_TITLE ? `${words.slice(0, LONGEST_TITLE).trimEnd()}…` : words;
}

/** Canonical decks are written the same way every time, so equal decks are equal text. */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Everything about a deck but its slides. */
const settingsOf = (deck: Deck): unknown => ({ ...deck, slides: undefined });

/** What differs between two versions of a deck. */
export function deckDelta(before: Deck, after: Deck): DeckDelta {
  const was = new Map(before.slides.map((slide, i) => [slide.id, { slide, number: i + 1 }] as const));
  const now = new Map(after.slides.map((slide, i) => [slide.id, { slide, number: i + 1 }] as const));
  const changes: SlideChange[] = [];
  // A removed slide is listed where it stood: after the last slide that came before it and is still there.
  const goneAfter = new Map<string | null, SlideChange[]>();
  let anchor: string | null = null;
  for (const slide of before.slides) {
    if (now.has(slide.id)) {
      anchor = slide.id;
      continue;
    }
    const at = was.get(slide.id)!;
    const list = goneAfter.get(anchor) ?? [];
    list.push({ kind: "removed", id: slide.id, title: slideTitle(slide), before: at, after: null });
    goneAfter.set(anchor, list);
  }
  changes.push(...(goneAfter.get(null) ?? []));
  for (const slide of after.slides) {
    const older = was.get(slide.id);
    const at = now.get(slide.id)!;
    if (!older) changes.push({ kind: "added", id: slide.id, title: slideTitle(slide), before: null, after: at });
    else if (!same(older.slide, slide)) changes.push({ kind: "changed", id: slide.id, title: slideTitle(slide), before: older, after: at });
    changes.push(...(goneAfter.get(slide.id) ?? []));
  }
  const kept = (deck: Deck, other: Map<string, unknown>) => deck.slides.map((s) => s.id).filter((id) => other.has(id));
  return {
    changes,
    reordered: !same(kept(before, now), kept(after, was)),
    settings: !same(settingsOf(before), settingsOf(after)),
    slidesBefore: before.slides.length,
    slidesAfter: after.slides.length,
  };
}

/** The two versions of the deck a proposal is about, or null when it is about no deck. */
export function deckTexts(proposal: Proposal): DeckTexts | null {
  const op = proposal.op;
  if (op.kind === "edit_deck" && typeof op.base === "string" && typeof op.text === "string") return { before: op.base, after: op.text };
  if (op.kind === "create_deck" && typeof op.text === "string") return { before: null, after: op.text };
  if ((op.kind === "trash" || op.kind === "trash_note") && String(op.path ?? "").endsWith(".deck") && typeof proposal.before === "string") return { before: proposal.before, after: null };
  return null;
}

/** Whether the review draws this proposal as slides. */
export const isDeckProposal = (proposal: Proposal): boolean => deckTexts(proposal) !== null;

const n = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A change in a line: "4 slides removed, 1 slide changed". */
export function deltaWords(delta: DeckDelta): string {
  const parts: string[] = [];
  for (const kind of ["removed", "added", "changed"] as const) {
    const count = delta.changes.filter((c) => c.kind === kind).length;
    if (count > 0) parts.push(`${n(count, "slide")} ${kind}`);
  }
  if (delta.reordered) parts.push("new order");
  if (delta.settings) parts.push("deck settings changed");
  return parts.length > 0 ? parts.join(", ") : "No slide differs";
}
