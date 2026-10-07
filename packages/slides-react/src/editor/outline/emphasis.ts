// Whether the marks written for some looks would be read back as those
// looks. The engine reads `**`, `*` and `~~` the way CommonMark reads emphasis:
// each run of marks may open or close by the characters beside it, and a
// closer pairs with the nearest opener that fits. This follows the same steps
// on the marks a line has been written with, so a line that would be read
// wrongly (a stray `**` left in the words) can be written with tags instead.

/** The looks a pair gives what is inside it. */
export const BOLD = 1;
export const ITALIC = 2;
export const STRIKE = 4;
export const UNDER = 8;

export type Tag = "b" | "i" | "s" | "u";

/** A run of marks, or a tag, as the reader sees it. */
export interface Delim {
  kind: "star" | "tilde" | "tag";
  /** For a tag, which one and whether it opens. */
  tag?: Tag;
  opening?: boolean;
  /** Characters in the run as written. */
  n: number;
  /** Characters no pair has used yet; they would end up as words. */
  left: number;
  open: boolean;
  close: boolean;
  /** Where its token stands among the others. */
  at: number;
}

export interface Pair {
  open: number;
  close: number;
  flag: number;
}

const isSpace = (c: string | undefined): boolean => c === undefined || /\s/.test(c);
const isPunct = (c: string | undefined): boolean => c !== undefined && !/[\p{L}\p{N}\s\p{Cc}]/u.test(c);

/** Whether a run of marks between `before` and `after` may open, and may close. The edges of the text count as spaces. */
export function flanking(before: string | undefined, after: string | undefined): { open: boolean; close: boolean } {
  return {
    open: !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before)),
    close: !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after)),
  };
}

/** Whether `closer` may take characters from `opener`. */
function fits(opener: Delim, closer: Delim): boolean {
  if (!opener.open || opener.left === 0) return false;
  if (opener.kind === "star" && closer.kind === "star") {
    // The rule of three keeps `**a*b**` from pairing across the middle mark when either side could also be the other kind.
    const odd = (opener.close || closer.open) && (opener.n + closer.n) % 3 === 0 && !(opener.n % 3 === 0 && closer.n % 3 === 0);
    return !odd;
  }
  if (opener.kind === "tilde" && closer.kind === "tilde") return true;
  if (opener.kind === "tag" && closer.kind === "tag") return opener.opening === true && closer.opening === false && opener.tag === closer.tag;
  return false;
}

function flagOf(delim: Delim, used: number): number {
  if (delim.kind === "star") return used === 2 ? BOLD : ITALIC;
  if (delim.kind === "tilde") return STRIKE;
  return delim.tag === "b" ? BOLD : delim.tag === "i" ? ITALIC : delim.tag === "s" ? STRIKE : UNDER;
}

/** Pairs the marks up; afterwards `left` says how much of each would be words. */
export function pairUp(delims: Delim[]): Pair[] {
  const alive = delims.map(() => true);
  const pairs: Pair[] = [];
  for (let c = 0; c < delims.length; c++) {
    const closer = delims[c]!;
    if (!closer.close) continue;
    while (closer.left > 0) {
      let o = c - 1;
      while (o >= 0 && !(alive[o] && fits(delims[o]!, closer))) o -= 1;
      if (o < 0) break;
      const opener = delims[o]!;
      const used = closer.kind === "tag" ? 1 : closer.kind === "tilde" ? 2 : opener.left >= 2 && closer.left >= 2 ? 2 : 1;
      pairs.push({ open: opener.at, close: closer.at, flag: flagOf(opener, used) });
      opener.left -= used;
      closer.left -= used;
      // What sat between the two can no longer pair with anything.
      alive.fill(false, o + 1, c);
      if (opener.left === 0) alive[o] = false;
    }
    if (closer.left === 0 || !closer.open) alive[c] = false;
  }
  return pairs;
}

/** The looks each token gets: those of the pairs that open before it and close after it. */
export function looksByToken(length: number, pairs: readonly Pair[]): number[] {
  const flags = [BOLD, ITALIC, STRIKE, UNDER];
  const delta = Array.from({ length: length + 1 }, () => [0, 0, 0, 0]);
  for (const pair of pairs) {
    const k = flags.indexOf(pair.flag);
    if (k < 0) continue;
    delta[pair.open + 1]![k]! += 1;
    delta[pair.close]![k]! -= 1;
  }
  const live = [0, 0, 0, 0];
  return Array.from({ length }, (_, token) => {
    let bits = 0;
    for (let k = 0; k < 4; k++) {
      live[k]! += delta[token]![k]!;
      if (live[k]! > 0) bits |= flags[k]!;
    }
    return bits;
  });
}

/** A token of a written line: words with the looks meant for them, or a mark. */
export type Token = { kind: "text"; looks: number } | { kind: "mark"; delim: Delim };

/**
 * Whether the tokens would be read as meant: every mark used up, and each
 * stretch of words given exactly the looks it was written for. The marks are
 * listed by their place among the tokens as `delim.at`.
 */
export function readsBack(tokens: readonly Token[]): boolean {
  const delims = tokens.flatMap((token) => (token.kind === "mark" ? [token.delim] : []));
  const pairs = pairUp(delims);
  if (delims.some((delim) => delim.left > 0)) return false;
  const looks = looksByToken(tokens.length, pairs);
  return tokens.every((token, at) => token.kind === "mark" || looks[at] === token.looks);
}
