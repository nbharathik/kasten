// What a person types for the address of an embedded page or a video.

import { linkFromInput } from "../../text/links.ts";

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/?#]|$)/i;

/**
 * The address of a web page to embed, from what was typed: an ordinary web
 * address as it is, a bare `example.com/page` with `https://` in front, and
 * `localhost:3000` with `http://` (a page on this computer has no certificate).
 * Null for nothing, and for anything that is not a web page (mail, phone,
 * `javascript:`), which cannot be embedded.
 */
export function pageAddress(input: string): string | null {
  const typed = input.trim();
  if (typed === "") return null;
  const address = LOCAL.test(typed) ? `http://${typed}` : linkFromInput(typed);
  return address !== null && /^https?:\/\//i.test(address) ? address : null;
}

/**
 * The source of a video, from what was typed: a web address (an ordinary one,
 * completed as for a page), or the name of a file the deck's store holds, which
 * is kept as typed, less the spaces round it. Null for nothing.
 */
export function videoSource(input: string): string | null {
  const typed = input.trim();
  if (typed === "" || /\p{Cc}/u.test(typed)) return null;
  // `http:`, `https:` and bare hosts are addresses; anything else with a colon (a script, a mail link) is not a video.
  if (/^[a-z][a-z0-9+.-]*:/i.test(typed) && !/^[a-z0-9.-]+:\d+(\/|$)/i.test(typed)) return /^https?:\/\//i.test(typed) ? typed : null;
  return LOCAL.test(typed) ? `http://${typed}` : /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?\//i.test(typed) ? `https://${typed}` : typed;
}
