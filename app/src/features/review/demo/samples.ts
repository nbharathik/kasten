// Sample agent work for the review demo (dev only, see index.html here):
// six proposals from two sessions, on the dev vault's own notes and its sample deck.

import type { Proposal } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { replaceSection } from "../../workspace/preview/memory-extras";

export const ROADMAP = "projects/photo-organiser/pages/photo-organiser-roadmap.md";
export const SPEC_CARD = "inbox/look-at-json-canvas-spec.md";
export const SKETCH = "projects/photo-organiser/cards/duplicate-score-sketch.md";
export const METHOD = "library/zettelkasten-method.md";
export const PAPER = "projects/note-taking-study/pages/report-draft.md";
export const PAPER_TAG = "tags/paper.yaml";
export const DECK = "library/tool-use-in-language-models.deck";

export const SESSION_A = "01K5Z3A7Q9CLAUDECODE0AUGRT";
export const SESSION_B = "01K5Z4D2M1CLAUDEDESKTOP7QX";
export const SESSION_C = "01K5W8H6T4CLAUDECODE2PREVS";

const ZETTEL_AFTER = `One idea per card, linked densely. Cards are **atomic**, _autonomous_ and
always linked back, e.g. [[Duplicate score for photos|a worked example]].

## Principles

- **Atomic:** one idea per card, small enough to link precisely.
- **Autonomous:** each card makes sense on its own.
- **Linked:** every new card links to at least one older card.

## Daily workflow

- Fleeting notes go to the inbox.
  - Triage them daily with J, K and M.
- Permanent notes live in projects or the library.
`;

const OPEN_QUESTIONS = `1. Score a moved wall by its displacement, and a deleted one as a full miss.
2. A hash join is enough below 50k elements; measure before optimising.
`;

/** The sample deck's text with the slides at these places (from 0) taken out. */
export function withoutSlides(text: string, gone: number[]): string {
  const deck = JSON.parse(text) as { slides: unknown[] };
  deck.slides = deck.slides.filter((_, i) => !gone.includes(i));
  return `${JSON.stringify(deck, null, 2)}\n`;
}

/** The sample deck's text with the first words of the slide at `place` (from 0) changed. */
export function retitled(text: string, place: number, title: string): string {
  const deck = JSON.parse(text) as { slides: { elements: { placeholder?: string; text?: { paragraphs: { runs: { t: string }[] }[] } }[] }[] };
  const heading = deck.slides[place]?.elements.find((e) => e.placeholder === "title");
  const run = heading?.text?.paragraphs[0]?.runs[0];
  if (run) run.t = title;
  return `${JSON.stringify(deck, null, 2)}\n`;
}

const body = (text: string | undefined) => splitFrontmatter(text ?? "").body;
const iso = (millis: number) => new Date(millis).toISOString().replace(/\.\d+Z$/, "Z");

function base(id: string, created: number, session: string, client: string): Omit<Proposal, "op" | "target" | "reason" | "diff" | "before" | "after" | "note"> {
  return { id, created: iso(created), session, client, status: "pending", decided: null, decidedBy: null };
}

/** The proposals, oldest first, on the notes in `seed`. */
export function sampleProposals(seed: Record<string, string>, now: number): Proposal[] {
  const minutes = (m: number) => now - m * 60_000;
  const roadmap = body(seed[ROADMAP]);
  const method = body(seed[METHOD]);
  const tag = seed[PAPER_TAG] ?? "";
  const deck = seed[DECK];
  return [
    {
      ...base("01K5Z3B0PROPOSAL000000001", minutes(38), SESSION_A, "claude-code"),
      op: { kind: "replace_section", path: ROADMAP, heading: "Open questions", markdown: OPEN_QUESTIONS },
      target: { path: ROADMAP, title: "Photo organiser roadmap" },
      reason: "Removes 48% of the note's text (the limit is 40%)",
      note: null,
      diff: "",
      before: roadmap,
      after: replaceSection(roadmap, "Open questions", OPEN_QUESTIONS),
    },
    {
      ...base("01K5Z3B7PROPOSAL000000002", minutes(35), SESSION_A, "claude-code"),
      op: { kind: "trash", path: SPEC_CARD, reason: "Read and summarised on the Photo organiser brainstorm board." },
      target: { path: SPEC_CARD, title: "Look at the JSON Canvas spec" },
      reason: "This session already moved 5 notes to the trash (the limit is 5)",
      note: "Read and summarised on the Photo organiser brainstorm board.",
      diff: "Move “Look at the JSON Canvas spec” to the trash",
      before: body(seed[SPEC_CARD]),
      after: null,
    },
    {
      ...base("01K5Z3C2PROPOSAL000000003", minutes(31), SESSION_A, "claude-code"),
      op: { kind: "rename", path: SKETCH, title: "Diff metric: first sketch" },
      target: { path: SKETCH, title: "Duplicate score sketch" },
      reason: "This session changed 25 notes in the last 10 minutes; this would make 27 (the limit is 25)",
      note: null,
      diff: "Rename “Duplicate score sketch” to “Diff metric: first sketch”",
      before: null,
      after: null,
    },
    {
      ...base("01K5Z4D5PROPOSAL000000004", minutes(12), SESSION_B, "claude-desktop"),
      op: { kind: "edit", path: METHOD, body: ZETTEL_AFTER, base: method, reason: "Split into principles and a daily workflow." },
      target: { path: METHOD, title: "Zettelkasten method" },
      reason: "A full rewrite always waits for review",
      note: "Split into principles and a daily workflow, so the triage keys are easy to find.",
      diff: "",
      before: method,
      after: ZETTEL_AFTER,
    },
    {
      ...base("01K5Z4D9PROPOSAL000000005", minutes(9), SESSION_B, "claude-desktop"),
      op: { kind: "tag_schema", tag: "paper", schema: {} },
      target: null,
      reason: "A tag schema change always waits for review",
      note: null,
      diff: "Change the schema of #paper",
      before: tag,
      after: tag
        .replace("  - {key: repo, type: url}\n", "  - {key: reviewers, type: multi_select}\n  - {key: repo, type: url}\n")
        .replace("  - {name: All, type: table, sort: [{key: deadline, dir: asc}]}", "  - {name: By venue, type: table, sort: [{key: venue, dir: asc}]}"),
    },
    // Two slides of the sample deck, after the session already took three out of decks: over the limit added up.
    ...(deck
      ? [
          {
            ...base("01K5Z4E1PROPOSAL000000006", minutes(6), SESSION_B, "claude-desktop"),
            op: { kind: "edit_deck", path: DECK, tool: "delete_slides", summary: "delete slides", base: deck, text: withoutSlides(deck, [2, 3]), sent: 90 },
            target: { path: DECK, title: "Tool use in language models" },
            reason: "This session already took 3 slides out of decks in the last 10 minutes; this would make 5 (the limit is 3)",
            note: null,
            diff: "Delete slides: removes 2 slides (“The loop” and “Two ways to call”)",
            before: null,
            after: null,
          } satisfies Proposal,
        ]
      : []),
  ];
}
