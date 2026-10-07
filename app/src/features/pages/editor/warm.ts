// Warms the page editor while the window is idle: one hidden editor opens
// and saves a sample page with the common blocks, then goes away. The
// browser compiles the editor's code the first time it runs, which makes a
// session's first page open several times slower than later ones; after a
// warm-up it opens as fast as the rest.

import { createKastenCrepe } from "./crepe";
import { openNote } from "./session";

const SAMPLE = [
  "# Warm up",
  "",
  "Some **bold**, *italic*, `code` and a [[Link]] with ~~strike~~.",
  "",
  "## A list",
  "",
  "- [ ] A to-do",
  "- An item",
  "  1. A numbered one",
  "",
  "> [!note] A callout",
  "> With a line.",
  "",
  "<details><summary>A toggle</summary>",
  "",
  "Inside.",
  "",
  "</details>",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```js",
  "const a = 1;",
  "```",
  "",
].join("\n");

let warmed = false;

export async function warmEditor(): Promise<void> {
  if (warmed) return;
  warmed = true;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.className = "kasten-page-editor";
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:720px;height:600px;overflow:hidden;visibility:hidden;pointer-events:none;contain:strict";
  document.body.append(host);
  try {
    const crepe = await createKastenCrepe(host, {});
    openNote(crepe, SAMPLE).save();
    await crepe.destroy();
    performance.mark?.("kasten:warm");
  } catch {
    // Only a speed-up.
  } finally {
    host.remove();
  }
}
