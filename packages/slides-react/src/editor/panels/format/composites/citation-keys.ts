// The keys of a citation. Reading them from a box, and adding to them: the
// citation picker (which finds a reference in the vault's bibliography and adds
// its key) calls `addCitationKeys`, so that adding a key is one step of undo
// and never doubles a key that is there.

import type { Element } from "@kasten-slides/wasm";

import type { EditorSession } from "../../../session/session.ts";
import { patchEach } from "../write.ts";

/** The keys in what was typed: separated by commas, semicolons or spaces, each once, in the order typed. */
export function parseKeys(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).filter(Boolean))];
}

/** Keys as a box shows them. */
export const showKeys = (keys: readonly string[]): string => keys.join(", ");

/** Adds keys to the end of each citation among these elements, leaving out those it already has. Resolves to whether anything was added. */
export function addCitationKeys(session: EditorSession, elements: readonly Element[], keys: readonly string[]): boolean {
  const citations = elements.filter((e): e is Extract<Element, { type: "citation" }> => e.type === "citation");
  let added = false;
  patchEach(session, citations, (citation) => {
    const fresh = keys.filter((key) => !citation.keys.includes(key));
    if (fresh.length === 0) return null;
    added = true;
    return { keys: [...citation.keys, ...fresh] };
  });
  return added;
}
