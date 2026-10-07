// Where a live embed's React root draws: an element of its own, made for
// each mount. The root unmounts a moment later (the page may be going away
// inside React's own update), and until then everything it drew must stay
// in its element, or React's `removeChild` throws. So the embed swaps out
// the whole element and never touches what is inside it; the next root
// gets a new one, as one element holds one root.

import "./embed-host.css";

import { el } from "../ui/dom";

/** An empty element for a new root, in place of whatever `body` held. */
export function freshHost(body: HTMLElement): HTMLElement {
  const host = el("div", "kasten-embed-host");
  body.replaceChildren(host);
  return host;
}
