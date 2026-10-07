// Asks a reader to show a spot in a source: a highlight card's back-link,
// or a highlight picked in the Highlights view. The reader opens, scrolls to
// the page and flashes the highlight. A reader showing that source takes
// the request at once; one about to open takes it when it mounts.

import { useEffect, useRef } from "react";

import { useWorkspace, type OpenHow } from "../workspace/store";

export interface Spot {
  source: string;
  /** From 1. */
  page?: number;
  highlight?: string;
}

type Take = (spot: Spot) => boolean;

let pending: Spot | null = null;
const readers = new Set<Take>();

export function showSpot(spot: Spot, how?: OpenHow): void {
  useWorkspace.getState().go({ view: "highlights", path: spot.source }, how);
  pending = [...readers].some((take) => take(spot)) ? null : spot;
}

/** A reader of `source` takes the spots asked of it: the one waiting, then each new one. */
export function useSpotRequests(source: string, onSpot: (spot: Spot) => void): void {
  const handler = useRef(onSpot);
  useEffect(() => {
    handler.current = onSpot;
  }, [onSpot]);
  useEffect(() => {
    const take: Take = (spot) => {
      if (spot.source !== source) return false;
      handler.current(spot);
      return true;
    };
    if (pending && take(pending)) pending = null;
    readers.add(take);
    return () => {
      readers.delete(take);
    };
  }, [source]);
}

/** A link's target with its %-escapes read; one written by hand with a
 * bare % is taken as it is. */
function readEscapes(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/** A source link's spot: `sources/x.pdf#page=3&highlight=ID`, as highlight
 * cards write it, relative to the note at `from`. Null for other links. */
export function spotOfLink(href: string, from: string): Spot | null {
  const [target = "", fragment = ""] = href.split("#");
  const decoded = readEscapes(target);
  if (!/\.pdf$/i.test(decoded) || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
  const parts = from.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  const source = parts.join("/");
  if (!source.startsWith("sources/")) return null;
  const params = new URLSearchParams(fragment);
  const page = Number(params.get("page"));
  return { source, ...(Number.isInteger(page) && page > 0 ? { page } : {}), ...(params.get("highlight") ? { highlight: params.get("highlight")! } : {}) };
}
