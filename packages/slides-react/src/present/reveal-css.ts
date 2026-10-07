// reveal.js's stylesheet, made safe to put in a page that is not a slide show. The `@media print` rules at its
// end restyle every div, paragraph and heading under `.reveal` for a printed handout, which would flatten Kasten's
// slides (each element is a positioned div); they go. The sheet is in the page only while a presentation is: its
// rules are all under `.reveal`, but they are not the editor's to carry.

import revealCss from "reveal.js/reveal.css?raw";

/** The css without its `@media print` blocks. */
export function withoutPrintRules(css: string): string {
  let out = "";
  let at = 0;
  for (;;) {
    const start = css.indexOf("@media print", at);
    if (start < 0) return out + css.slice(at);
    out += css.slice(at, start);
    const open = css.indexOf("{", start);
    if (open < 0) return out;
    let depth = 1;
    let i = open + 1;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    at = i;
  }
}

/** reveal.js's rules for a presentation on screen. */
export const REVEAL_CSS: string = withoutPrintRules(revealCss);

let users = 0;
let sheet: HTMLStyleElement | null = null;

/** Puts reveal.js's rules in the page for as long as a presentation is open; returns how to take them out. */
export function installRevealCss(doc: Document = document): () => void {
  if (users++ === 0) {
    sheet = doc.createElement("style");
    sheet.dataset.ksShowReveal = "";
    sheet.textContent = REVEAL_CSS;
    doc.head.append(sheet);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--users === 0) {
      sheet?.remove();
      sheet = null;
    }
  };
}
