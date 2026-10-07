// Source-preserving Markdown for a WYSIWYG editor.
//
// No Markdown editor writes back the bytes it read: `*` bullets become `-`,
// setext headings become ATX, hard-wrapped paragraphs are re-flowed. Kasten
// promises that opening and saving a note changes nothing, and that Markdown the
// editor does not understand survives edits elsewhere in the note. So the
// editor's serializer only writes the top-level blocks the user changed; every
// other block is copied from the source verbatim, with the whitespace around it.

import {
  contextualParser,
  detectEol,
  isBlank,
  parseVisible,
  type BlockRange,
  type MarkdownCodec,
  type Snapshot,
  type Unit,
} from "./codec";

export type { BlockRange, MarkdownCodec, Snapshot } from "./codec";
export { saveMarkdown } from "./save";

export interface Loaded<N> {
  nodes: N[];
  snapshot: Snapshot<N>;
}

/** Parses `body` block by block, remembering each block's source. */
export function loadMarkdown<N>(codec: MarkdownCodec<N>, body: string): Loaded<N> {
  const eol = detectEol(body);
  const ranges = checkedRanges(codec, body);
  if (!ranges) return wholeBodyFallback(codec, body, eol);

  const context = ranges
    .filter((r) => r.context)
    .map((r) => body.slice(r.start, r.end))
    .join("\n\n");
  const parseBlock = contextualParser(codec, context);

  const units: Unit<N>[] = [];
  let pos = 0;
  for (const r of ranges) {
    const src = body.slice(r.start, r.end);
    units.push({ gap: body.slice(pos, r.start), src, nodes: r.context ? parseVisible(codec, src) : parseBlock(src) });
    pos = r.end;
  }
  return { nodes: units.flatMap((u) => u.nodes), snapshot: { units, tail: body.slice(pos), eol, context } };
}

/**
 * Editors normalise content on load (default attributes, a trailing empty
 * paragraph). Adopts the nodes the editor actually holds, but only when they
 * line up one to one by type; anything else keeps the parsed nodes, which at
 * worst re-serializes blocks and never misplaces them.
 */
export function rebaseSnapshot<N>(codec: MarkdownCodec<N>, snapshot: Snapshot<N>, loaded: readonly N[]): Snapshot<N> {
  const total = snapshot.units.reduce((n, u) => n + u.nodes.length, 0);
  const extra = loaded.slice(total);
  if (loaded.length < total || extra.some((n) => !isBlank(codec, n))) return snapshot;
  const flat = snapshot.units.flatMap((u) => u.nodes);
  if (flat.some((n, i) => codec.typeOf(n) !== codec.typeOf(loaded[i]!))) return snapshot;

  let k = 0;
  const units = snapshot.units.map((u) => {
    const nodes = loaded.slice(k, k + u.nodes.length);
    k += u.nodes.length;
    return { ...u, nodes };
  });
  return { ...snapshot, units };
}

/** Ranges must be ordered, disjoint and separated only by whitespace. */
function checkedRanges<N>(codec: MarkdownCodec<N>, body: string): BlockRange[] | null {
  let ranges: BlockRange[];
  try {
    ranges = codec.blockRanges(body);
  } catch {
    return null;
  }
  let pos = 0;
  for (const r of ranges) {
    if (r.start < pos || r.end < r.start || r.end > body.length) return null;
    if (body.slice(pos, r.start).trim() !== "") return null;
    pos = r.end;
  }
  return body.slice(pos).trim() === "" ? ranges : null;
}

/** Last resort when the tokenizer's ranges cannot be trusted: one block. */
function wholeBodyFallback<N>(codec: MarkdownCodec<N>, body: string, eol: "\n" | "\r\n"): Loaded<N> {
  const lead = /^\s*/.exec(body)![0];
  const trimmed = body.slice(lead.length).replace(/\s+$/, "");
  if (trimmed === "") return { nodes: [], snapshot: { units: [], tail: body, eol, context: "" } };
  const nodes = parseVisible(codec, body);
  const unit = { gap: lead, src: trimmed, nodes };
  return { nodes, snapshot: { units: [unit], tail: body.slice(lead.length + trimmed.length), eol, context: "" } };
}
