// Heptabase's peek: hovering a page mention for a moment shows a card with
// the page's first lines, so it can be read without leaving the page.

import type { LinkProvider } from "../links";
import { el, withGlyph } from "../ui/dom";

const DELAY = 450;
let card: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let owner: HTMLElement | null = null;

function hide(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  owner = null;
  card?.remove();
  card = null;
}

async function show(anchor: HTMLElement, title: string, links: LinkProvider): Promise<void> {
  const preview = await links.preview?.(title).catch(() => null);
  if (!preview || owner !== anchor || !anchor.isConnected) return;
  card?.remove();
  card = el("div", "kasten-peek", { role: "tooltip" });
  card.append(
    withGlyph(el("div", "kasten-peek-title"), preview.icon ?? "icon:page", 15, ` ${preview.title}`),
    el("div", "kasten-peek-text", { textContent: preview.text || "Empty page" }),
    el("div", "kasten-peek-hint", { textContent: "Click to open" }),
  );
  document.body.append(card);
  const rect = anchor.getBoundingClientRect();
  const width = card.offsetWidth || 320;
  card.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  const below = rect.bottom + 6;
  const height = card.offsetHeight || 160;
  card.style.top = `${below + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : below}px`;
}

/** Wires hover previews onto a mention's element. */
export function attachPeek(anchor: HTMLElement, title: () => string, links: () => LinkProvider): void {
  anchor.addEventListener("mouseenter", () => {
    // An embed already shows the page.
    if (!links().preview || anchor.classList.contains("is-missing") || anchor.classList.contains("kasten-embed")) return;
    hide();
    owner = anchor;
    timer = setTimeout(() => void show(anchor, title(), links()), DELAY);
  });
  anchor.addEventListener("mouseleave", hide);
  anchor.addEventListener("mousedown", hide);
}

/** Takes away the peek shown for `anchor`, as when its link goes. */
export function hidePeekOf(anchor: HTMLElement): void {
  if (owner === anchor) hide();
}
