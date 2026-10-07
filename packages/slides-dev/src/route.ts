import { useEffect, useState } from "react";

/** Which page the address asks for: `#/deck/<file name>` is that deck, anything else the list. */
export function deckOf(hash: string): string | null {
  const match = /^#\/deck\/(.+)$/.exec(hash);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export const linkTo = (deck: string | null): string => (deck === null ? "#/" : `#/deck/${encodeURIComponent(deck)}`);

export function go(deck: string | null): void {
  location.hash = linkTo(deck);
}

/** The deck the address names, kept up to date. */
export function useDeckRoute(): string | null {
  const [deck, setDeck] = useState(() => deckOf(location.hash));
  useEffect(() => {
    const changed = () => setDeck(deckOf(location.hash));
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return deck;
}
