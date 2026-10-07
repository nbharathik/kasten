// More of what the palette finds: PDFs by title, Settings groups by name,
// and the searches run lately, offered again when the palette opens.

import type { SourceInfo } from "../../../lib/vault/types";
import { lineIcon } from "../../../ui/glyph";
import { useWorkspace, type OpenHow } from "../store";
import { SECTIONS } from "../views/settings/sections";
import { openSettingsAt } from "../views/settings/jump";
import { score } from "./match";

export interface Row {
  key: string;
  icon: string;
  label: string;
  detail?: string;
  hint?: string;
  /** The palette stays open: the row shows more in it. */
  stay?: boolean;
  /** Pages open where `how` says: Ctrl for a tab, Shift for the stack, Alt for a split. */
  run(how: OpenHow): void;
}

const KEY = "kasten.palette.searches";
const KEPT = 5;

/** PDFs whose titles match `q`, best first. */
export function pdfRows(sources: readonly SourceInfo[] | null, q: string): Row[] {
  if (!sources || !q) return [];
  return sources
    .map((source) => ({ source, s: score(source.title, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(({ source }) => ({
      key: `pdf:${source.path}`,
      icon: lineIcon("book"),
      label: source.title,
      detail: "PDF",
      run: (how) => useWorkspace.getState().go({ view: "highlights", path: source.path }, how),
    }));
}

/** Settings groups named by `q`, which may start with "settings". */
export function settingsRows(q: string): Row[] {
  const wanted = q.replace(/^settings?\b\s*/i, "");
  if (wanted.length < 2) return [];
  return SECTIONS.map((title) => ({ title, s: score(title, wanted) }))
    .filter((x) => x.s >= 40)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map(({ title }) => ({ key: `settings:${title}`, icon: lineIcon("settings"), label: title, detail: "Settings", run: (how) => openSettingsAt(title, how) }));
}

/** The searches run lately, newest first. */
export function recentSearches(): string[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(kept) ? kept.filter((q): q is string => typeof q === "string" && q.trim() !== "").slice(0, KEPT) : [];
  } catch {
    return [];
  }
}

/** Keeps `query` as the latest search. */
export function keepSearch(query: string): void {
  const q = query.trim();
  if (!q) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([q, ...recentSearches().filter((k) => k !== q)].slice(0, KEPT)));
  } catch {
    // The palette opens without them next time.
  }
}
