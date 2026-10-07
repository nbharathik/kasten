// The chat behind the editor's assistant tab: one thread for each deck, and the chip that tells it which slide,
// and which elements of it, the person is looking at.

import type { AiPanelProps } from "@kasten-slides/react";

import { useChat } from "../chat/store";
import { chipKey, type Chip } from "../chat/thread";

/** Deck path to the thread that talks about it, while the window lives. */
const threads = new Map<string, string>();

/** The thread of a deck: made the first time and found again after, until it is discarded. It is not opened in the Chat view. */
export function threadOfDeck(deck: string): string {
  const chat = useChat.getState();
  const known = threads.get(deck);
  if (known && chat.threads[known]) return known;
  const id = chat.start({ open: false });
  threads.set(deck, id);
  return id;
}

type Where = Pick<AiPanelProps, "deckPath" | "slideId" | "slideNumber" | "slideTitle" | "elementIds">;

/** What the person is looking at, as a chip: the deck, the slide and the selected elements, which the backend reads when a message is sent. */
export function slideChip({ deckPath, slideId, slideNumber, slideTitle, elementIds }: Where): Chip {
  const title = slideTitle.length > 28 ? `${slideTitle.slice(0, 27).trimEnd()}…` : slideTitle;
  const selected = elementIds.length === 0 ? "" : elementIds.length === 1 ? " · 1 selected" : ` · ${elementIds.length} selected`;
  return { kind: "slide", label: `Slide ${slideNumber}: ${title}${selected}`, ref: [deckPath ?? "", slideId, ...elementIds] };
}

/**
 * Puts the chip for the slide in the thread and takes the one for the slide before out. A chip the person removed by hand
 * stays out until the slide or the selection changes. Answers the key to take it out again by.
 */
export function followSlide(thread: string, chip: Chip, before: string | null): string {
  const chat = useChat.getState();
  if (before) chat.removeChip(thread, before);
  chat.addChip(thread, chip);
  return chipKey(chip);
}

/** Takes the chip out, when the tab goes. */
export function leaveSlide(thread: string, key: string): void {
  useChat.getState().removeChip(thread, key);
}
