import { lazy } from "react";

/** The editor and the slide engine load when the first deck is opened. */
export const LazyDeck = lazy(() => import("./DeckView").then((m) => ({ default: m.DeckView })));
