// What AI writes in the browser preview's page editor, where no provider is
// reached: answers made from the page itself, so the flow can be tried.
// The app asks the person's own provider instead.

import type { WriteRequest } from "../types";

/** The sentences of `text`, without Markdown's marks. */
function sentences(text: string): string[] {
  const plain = text
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (plain.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ended = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function cannedWriting(request: WriteRequest): string {
  const said = sentences(request.selection);
  const asked = request.instruction.toLowerCase();
  switch (request.action) {
    case "summarize": {
      const points = said.slice(0, 3).map((s) => `- ${ended(capital(s.length > 90 ? `${s.slice(0, 88).trimEnd()}…` : s))}`);
      return points.length ? points.join("\n") : "- This page is short: one idea so far.";
    }
    case "continue":
      return "Next, note what you learned while it is fresh, and one thing you would do differently next time.";
    case "ask":
      if (!said.length) return [`- A first step for “${request.instruction.trim()}”`, "- What would make it easier?", "- Who could help, and by when?"].join("\n");
      if (/list|bullet|points/.test(asked)) return said.map((s) => `- ${ended(capital(s))}`).join("\n");
      if (/short|brief|concise/.test(asked)) return ended(capital(said[0]!));
      return said.map((s) => ended(capital(s))).join(" ");
  }
}
