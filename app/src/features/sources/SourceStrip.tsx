// On a highlight card, under its title: which PDF its quote came from, and
// the way back to the spot: following the link opens the PDF at that page
// and flashes the highlight. It reads the card's
// frontmatter, so it works wherever the card has moved.

import { useEffect } from "react";

import { howFrom } from "../workspace/store";
import { showSpot, type Spot } from "./highlight-request";
import { useSources, useSourceTitle } from "./store";
import { Icon } from "../../ui/Icon";

export function SourceStrip({ spot }: { spot: Spot }) {
  const title = useSourceTitle(spot.source);
  useEffect(() => {
    if (!useSources.getState().list) void useSources.getState().loadList();
  }, []);
  return (
    <div className="kasten-source-strip">
      <Icon name="book" className="size-4 text-muted" />
      <span className="kasten-source-strip-from">
        From <strong>{title}</strong>
        {spot.page ? `, page ${spot.page}` : ""}
      </span>
      <button type="button" onClick={(e) => showSpot(spot, howFrom(e))}>
        Open at the highlight
      </button>
    </div>
  );
}
