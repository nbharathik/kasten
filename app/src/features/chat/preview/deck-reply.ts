// The preview's chat when it is asked about a slide. No model answers there, so the steps are scripted: read the slide,
// change it, check the deck. The change is real. It is made with the editor's own operations, kept in the chat's session
// (so "Undo this chat's changes" takes it back), and marked as the assistant's work, so the open deck shows the badges.
// Asked to take slides out, the script shows a change that waits for review and changes nothing.

import type { Deck } from "@kasten-slides/wasm";

import type { DeckFile, VaultClient } from "../../../lib/vault/types";
import type { Agent } from "../../workspace/preview/agent-sessions";
import type { ChatEvent, ContextChip } from "../types";
import { change, check, plan, read } from "./deck-edit";

/** The slide the person is looking at, and the elements selected on it. */
export interface SlideAsk {
  deck: string;
  slide: string;
  elements: string[];
}

/** The slide chip of a message: [deck path, slide id, ...element ids]. */
export function slideAsk(context: readonly ContextChip[]): SlideAsk | null {
  const chip = context.find((c) => c.kind === "slide");
  const [deck, slide, ...elements] = chip?.ref ?? [];
  return deck && slide ? { deck, slide, elements } : null;
}

/** What the preview's vault adds for a deck (memory-agents.ts). */
export interface DeckVault extends VaultClient {
  agentEditDeck?(agent: Agent, path: string, text: string, summary: string): Promise<DeckFile>;
}

/** What a turn is played with. */
export interface DeckTurn {
  vault: DeckVault | null;
  ask: SlideAsk;
  /** What the person wrote. */
  text: string;
  agent: Agent;
  say(event: Omit<ChatEvent, "chat" | "turn">): void;
  /** Streams words; false when the answer was stopped. */
  stream(text: string): Promise<boolean>;
  /** A pause as long as a tool takes. */
  pause(): Promise<void>;
  id(): string;
}

const INTRO =
  "This is the **browser preview**, so no model answers here: the steps below are scripted. The change to the deck is real, made with the editor's own operations, and it is marked as the assistant's work.\n\n";

const REMOVAL = /\b(?:remove|delete|drop|cut)\b[^.?!]*\bslides?\b/i;
const CHECK = /\b(?:lint|check)\b/i;
const DIAGRAM = /\bdiagram\b/i;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
const named = (title: string) => `“${title}”`;

/** Plays the turn; false when the answer was stopped. */
export async function playDeck(turn: DeckTurn): Promise<boolean> {
  const { ask, say, stream, pause } = turn;
  if (!(await stream(INTRO + "I'll read the slide first.\n\n"))) return false;

  // Read the slide.
  const read1 = turn.id();
  say({ kind: "tool", tool: { id: read1, name: "get_slide", input: { deck: ask.deck, slide: ask.slide } } });
  await pause();
  let file: DeckFile;
  let deck: Deck;
  try {
    if (!turn.vault) throw new Error("no vault is open");
    file = await turn.vault.deck(ask.deck);
    deck = await read(file.text);
  } catch (err) {
    say({ kind: "toolResult", result: { id: read1, ok: false, summary: `Could not read slide ${ask.slide} of ${named(ask.deck)}: ${message(err)}`, paths: [] } });
    return stream(`\n\nI could not read the deck: ${message(err)}.`);
  }
  const made = plan(deck, ask.slide, ask.elements);
  if (!made) {
    say({ kind: "toolResult", result: { id: read1, ok: false, summary: `Could not read slide ${ask.slide} of ${named(deck.title)}: that slide is not in the deck`, paths: [] } });
    return stream("\n\nThat slide is not in the deck any more, so there is nothing to change.");
  }
  say({ kind: "toolResult", result: { id: read1, ok: true, summary: `Read slide ${made.number} of ${named(deck.title)}`, paths: [] } });

  if (REMOVAL.test(turn.text)) return removal(turn, deck.title, deck.slides.slice(1).map((s) => s.id));
  if (DIAGRAM.test(turn.text)) {
    return stream(`\n\nThe preview cannot draw a diagram for you. In the app I would call \`add_diagram\` for ${named(made.title)}, with boxes and arrows laid out for me, and then check it with lint.`);
  }
  if (CHECK.test(turn.text)) return linting(turn, file.text, deck.title, "\n\nThe deck is checked; I changed nothing.");

  if (made.lines === 0) {
    return stream(`\n\nThe words of slide ${made.number} are already short: I changed nothing. Select an element with a longer line and ask again.`);
  }
  if (!(await stream(`\n\nI'll make ${count(made.lines, "line")} on slide ${made.number} shorter.\n\n`))) return false;

  // Change it.
  const edit = turn.id();
  say({ kind: "tool", tool: { id: edit, name: "update_elements", input: { deck: ask.deck, operations: [{ op: "patch_elements", input: { slide: ask.slide, patches: made.patches } }] } } });
  await pause();
  let written: string;
  try {
    if (!turn.vault?.agentEditDeck) throw new Error("this preview keeps no agent versions of a deck");
    const changed = await change(file.text, made, { by: turn.agent.client, session: turn.agent.session, at: Date.now() });
    const counted = await check(changed.text);
    const saved = await turn.vault.agentEditDeck(turn.agent, ask.deck, changed.text, `edit ${deck.title} § update elements (patch elements)`);
    written = saved.text;
    say({
      kind: "toolResult",
      result: { id: edit, ok: true, summary: `Changed ${named(deck.title)} · lint: ${count(counted.errors, "error")}, ${count(counted.warnings, "warning")}`, paths: [ask.deck] },
    });
  } catch (err) {
    say({ kind: "toolResult", result: { id: edit, ok: false, summary: `Could not change ${named(deck.title)}: ${message(err)}`, paths: [] } });
    return stream(`\n\nThe change was not made: ${message(err)}.`);
  }
  const after = `\n\nI shortened ${count(made.lines, "line")} on slide ${made.number}. They carry a star until you accept them or change them yourself: right-click one to accept it, or use “Accept all” below. “Undo this chat's changes” takes it all back.`;
  return linting(turn, written, deck.title, after);
}

/** The deck checked, then what to say. */
async function linting(turn: DeckTurn, text: string, title: string, after: string): Promise<boolean> {
  const id = turn.id();
  turn.say({ kind: "tool", tool: { id, name: "lint_deck", input: { deck: turn.ask.deck } } });
  await turn.pause();
  try {
    const counted = await check(text);
    turn.say({ kind: "toolResult", result: { id, ok: true, summary: `Checked ${named(title)}: ${count(counted.errors, "error")}, ${count(counted.warnings, "warning")}`, paths: [] } });
  } catch (err) {
    turn.say({ kind: "toolResult", result: { id, ok: false, summary: `Could not check ${named(title)}: ${message(err)}`, paths: [] } });
  }
  return turn.stream(after);
}

/** Taking slides out waits for the person: the call comes back as a proposal and nothing is changed. */
async function removal(turn: DeckTurn, title: string, ids: string[]): Promise<boolean> {
  if (!(await turn.stream(`\n\nYou asked me to take slides out. An assistant may take out three slides in ten minutes on its own; more waits for you.\n\n`))) return false;
  const id = turn.id();
  turn.say({ kind: "tool", tool: { id, name: "delete_slides", input: { deck: turn.ask.deck, slides: ids } } });
  await turn.pause();
  turn.say({
    kind: "toolResult",
    result: { id, ok: true, summary: `Waiting for review: delete slides from ${named(title)} (it takes out ${count(ids.length, "slide")}; more than 3 in 10 minutes waits for you)`, paths: [] },
  });
  return turn.stream("\n\nNothing was changed. In the app this is a proposal in Review, where you accept or decline it; the preview has no review queue to show.");
}
