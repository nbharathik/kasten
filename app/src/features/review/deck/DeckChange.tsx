// A deck change as slides: the slides a change touches, each before and
// after as thumbnails, or a new deck or a deck for the trash as its first
// slides. A proposal carries the two versions (deck-changes.ts), and so does a
// commit in the history, so `DeckVersions` draws any two texts. This file is
// loaded when the first deck change is shown, since it pulls in the slides
// code, which is large.

import { DeckEngine, loadSlides, type Deck } from "@kasten-slides/wasm";
import { useEffect, useState, type ReactNode } from "react";

import type { Proposal } from "../../../lib/vault/types";
import { Callout } from "../ui";
import { count, descriptionOf } from "../words";
import { deckDelta, deckTexts, deltaWords, slideTitle, type DeckDelta, type Placed, type SlideChange } from "./deck-changes";
import { SlideThumb } from "./SlideThumb";

/** The changed slides drawn before "Show more". */
const FIRST = 6;
/** The slides of a whole deck drawn (a new deck, a deck for the trash). */
const GLANCE = 6;

type Loaded =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; before: Deck | null; after: Deck | null; delta: DeckDelta | null };

/** A deck from its text, through the slides engine so an older file is brought up to date; the text as it is when the engine cannot be loaded. */
async function open(text: string): Promise<Deck> {
  try {
    await loadSlides();
    return DeckEngine.open(text).deck;
  } catch {
    return JSON.parse(text) as Deck;
  }
}

/** A deck proposal: the two versions are in the proposal. */
export default function DeckChange({ proposal }: { proposal: Proposal }) {
  const texts = deckTexts(proposal);
  return <DeckVersions before={texts?.before ?? null} after={texts?.after ?? null} words={descriptionOf(proposal.diff)} />;
}

interface VersionsProps {
  /** The deck's text before the change; none for a new deck. */
  before: string | null;
  /** The deck's text after the change; none for a deck that goes. */
  after: string | null;
  /** The change in words, when there are some; without, the header says "Changes". */
  words?: string;
  /** What a deck with no later version is called: it goes to the trash when a proposal is accepted, and is gone in the history. */
  gone?: string;
  /** Drawn without a border of its own, inside one that is there already. */
  bare?: boolean;
}

/** Two versions of a deck, as the slides that differ. */
export function DeckVersions({ before: beforeText, after: afterText, words = "", gone = "The deck that would go to the trash", bare = false }: VersionsProps) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setLoaded({ status: "loading" });
    Promise.all([beforeText === null ? null : open(beforeText), afterText === null ? null : open(afterText)]).then(
      ([before, after]) => live && setLoaded({ status: "ready", before, after, delta: before && after ? deckDelta(before, after) : null }),
      () => live && setLoaded({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [beforeText, afterText]);

  if (loaded.status === "failed") {
    return (
      <div className="space-y-2">
        {words && <p className="rounded-md border border-line bg-panel px-3 py-2 text-13">{words}</p>}
        <Callout tone="warn" icon="alert">
          The slides could not be drawn here, so the change is only described.
        </Callout>
      </div>
    );
  }
  if (loaded.status === "loading") return <Placeholder words={words} />;
  const { before, after, delta } = loaded;
  if (before && after && delta) return <Changes words={words} before={before} after={after} delta={delta} bare={bare} />;
  const deck = after ?? before;
  if (!deck) return <Placeholder words={words} />;
  return <Glance words={words} deck={deck} caption={after ? "The new deck" : gone} bare={bare} />;
}

/** While the slides load: what the core says the change is. */
function Placeholder({ words }: { words: string }) {
  return (
    <p aria-busy="true" className="rounded-md border border-line bg-panel px-3 py-2 text-13 text-muted">
      {words || "Reading the slides…"}
    </p>
  );
}

function Frame({ words, note, bare, children }: { words: string; note: string; bare: boolean; children: ReactNode }) {
  return (
    <div className={bare ? "overflow-hidden" : "overflow-hidden rounded-md border border-line"}>
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5 text-12 text-muted">
        <span className="min-w-0 flex-1 truncate">{words || (bare ? "Slides" : "Changes")}</span>
        <span className="shrink-0">{note}</span>
      </div>
      {children}
    </div>
  );
}

function Changes({ words, before, after, delta, bare }: { words: string; before: Deck; after: Deck; delta: DeckDelta; bare: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? delta.changes : delta.changes.slice(0, FIRST);
  const hidden = delta.changes.length - shown.length;
  return (
    <Frame words={words} note={deltaWords(delta)} bare={bare}>
      {delta.changes.length === 0 ? (
        <p className="px-3 py-2 text-13 text-muted">{delta.reordered || delta.settings ? "No slide differs; only the deck itself changes." : "The deck is the same."}</p>
      ) : (
        <ul className="max-h-[40rem] divide-y divide-line overflow-auto" aria-label="Slides that change">
          {shown.map((change) => (
            <Row key={`${change.kind}-${change.id}`} change={change} before={before} after={after} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button type="button" onClick={() => setAll(true)} className="w-full border-t border-line px-3 py-1.5 text-left text-12 text-muted transition-colors hover:text-ink">
          Show {count(hidden, "more slide")}
        </button>
      )}
    </Frame>
  );
}

const KINDS = {
  added: { label: "Added", pill: "bg-(--kr-add-bg) text-(--kr-add)" },
  removed: { label: "Removed", pill: "bg-(--kr-del-bg) text-(--kr-del)" },
  changed: { label: "Changed", pill: "bg-line/70 text-muted" },
} as const;

function Row({ change, before, after }: { change: SlideChange; before: Deck; after: Deck }) {
  const kind = KINDS[change.kind];
  return (
    <li className="px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-12">
        <span className={`inline-flex shrink-0 items-center rounded px-1.5 font-medium leading-5 ${kind.pill}`}>{kind.label}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{change.title}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Side name="Before" placed={change.before} deck={before} title={change.title} empty="Not in the deck yet" tone={change.kind === "removed" ? "del" : "plain"} />
        <Side name="After" placed={change.after} deck={after} title={change.title} empty="Removed" tone={change.kind === "added" ? "add" : "plain"} />
      </div>
    </li>
  );
}

const EDGES = { plain: "border-line", add: "border-(--kr-add)", del: "border-(--kr-del)" } as const;

function Side({ name, placed, deck, title, empty, tone }: { name: string; placed: Placed | null; deck: Deck; title: string; empty: string; tone: keyof typeof EDGES }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-11 text-muted">{placed ? `${name} · slide ${placed.number}` : name}</figcaption>
      <div className={`overflow-hidden rounded border ${EDGES[tone]}`}>
        {placed ? (
          <SlideThumb deck={deck} slide={placed.slide} number={placed.number} label={`${name}: slide ${placed.number}, ${title}`} />
        ) : (
          <div className="grid aspect-video place-items-center bg-panel text-12 text-muted">{empty}</div>
        )}
      </div>
    </figure>
  );
}

/** A whole deck's first slides: what a new deck holds, or what would go to the trash. */
function Glance({ words, deck, caption, bare }: { words: string; deck: Deck; caption: string; bare: boolean }) {
  const slides = deck.slides.slice(0, GLANCE);
  const more = deck.slides.length - slides.length;
  return (
    <Frame words={words} note={`${caption} · ${count(deck.slides.length, "slide")}`} bare={bare}>
      <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3" aria-label="Slides of the deck">
        {slides.map((slide, i) => (
          <li key={slide.id} className="min-w-0">
            <div className="overflow-hidden rounded border border-line">
              <SlideThumb deck={deck} slide={slide} number={i + 1} label={`Slide ${i + 1}, ${slideTitle(slide)}`} />
            </div>
            <p className="mt-1 truncate text-11 text-muted">
              {i + 1}. {slideTitle(slide)}
            </p>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="border-t border-line px-3 py-1.5 text-12 text-muted">and {count(more, "more slide")}</p>}
    </Frame>
  );
}
