// Decks read once for their thumbnails, kept until they change.

import type { Deck } from "@kasten-slides/wasm";
import { useEffect, useState } from "react";

import type { DeckInfo } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";

const cache = new Map<string, { modified: number; deck: Deck | null }>();
/** Thumbnails kept at most; decks beyond them are read again when shown. */
const MOST = 100;

/** The deck behind `info`, parsed for its thumbnail; null while it is read or when it cannot be. */
export function useDeckPreview(info: DeckInfo): Deck | null {
  const client = useWorkspace((s) => s.client);
  const hit = cache.get(info.path);
  const [deck, setDeck] = useState<Deck | null>(hit?.modified === info.modified ? hit.deck : null);
  useEffect(() => {
    if (!client || info.problem) return;
    const cached = cache.get(info.path);
    if (cached?.modified === info.modified) {
      setDeck(cached.deck);
      return;
    }
    let live = true;
    client.deck(info.path).then(
      (file) => {
        let parsed: Deck | null = null;
        try {
          parsed = JSON.parse(file.text) as Deck;
        } catch {
          // Shown as an empty tile.
        }
        cache.delete(info.path);
        cache.set(info.path, { modified: info.modified, deck: parsed });
        if (cache.size > MOST) cache.delete(cache.keys().next().value!);
        if (live) setDeck(parsed);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [client, info.path, info.modified, info.problem]);
  return deck;
}
