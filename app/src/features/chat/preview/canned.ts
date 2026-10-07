// What the preview's chat says: a canned answer in Markdown, with a tool
// call when the message mentions a card, cut into the small pieces a real
// answer streams in.

import type { ChatRequest, ContextChip } from "../types";

/** Text to stream, or a card to make as a tool call. */
export type Step = string | { card: string };

const INTRO = "This is the **browser preview**, so no AI answers here: this reply is canned, streamed a few letters at a time the way a real answer arrives.\n\n";

const APP = [
  "### In the desktop app",
  "",
  "Chat talks to the **Anthropic API** or to any **OpenAI-compatible** server, such as a local vLLM server. Add one in *Settings → AI providers*; its key stays in your system keychain.",
  "",
  "It works through the same core ops and guardrails as MCP, in a session of its own, so it can:",
  "",
  "- create cards and fill boards",
  "- edit sections of your pages",
  "- have everything it changed undone in one step",
  "",
  "",
].join("\n");

const HINT = "Mention a **card** in your next message, such as `make a card about Hotel ideas`, to see a tool call.";

const MENTIONS_CARD = /\bcards?\b/i;

function named(chip: ContextChip): string {
  switch (chip.kind) {
    case "note":
      return `[[${chip.label}]]`;
    case "board":
      return `the board **${chip.label}**`;
    case "tag":
      return `the tag view **${chip.label}**`;
    case "search":
      return `the results for “${chip.ref[0] ?? chip.label}”`;
    default:
      return chip.label;
  }
}

function listed(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function contextLine(context: readonly ContextChip[]): string {
  if (context.length === 0) return "";
  const count = context.length === 1 ? "one piece of context" : `${context.length} pieces of context`;
  return `You gave this chat ${count}: ${listed(context.map(named))}. In the app it goes with your message, so the answer can draw on it.\n\n`;
}

/** The card's title from the message: a quoted name, or what follows
 * "card about", "card called" and the like. */
export function cardTitle(text: string): string {
  const quoted = /[“"«]([^”"»\n]{2,80})[”"»]/.exec(text)?.[1];
  const after = /\bcards?\s+(?:about|called|named|titled|for|on)\s+(.+)/i.exec(text)?.[1];
  const raw = (quoted ?? after ?? "")
    .split(/[\n.?!;,]/)[0]!
    .replace(/[[\]|#*_`]/g, "")
    .replace(/\s+please$/i, "")
    .trim()
    .slice(0, 60)
    .trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Idea from the preview chat";
}

/** The answer to a message, in order. */
export function replyFor(request: Pick<ChatRequest, "text" | "context">): Step[] {
  const steps: Step[] = [INTRO + contextLine(request.context) + APP];
  if (MENTIONS_CARD.test(request.text)) steps.push("Here is a tool call, made for real in this preview:\n\n", { card: cardTitle(request.text) });
  else steps.push(HINT);
  return steps;
}

/** What follows the tool call: where the card went, or why it did not. */
export function afterCard(title: string | null, problem?: string): string {
  if (title === null) return `\n\nThe card could not be made: ${problem ?? "the preview vault refused it"}.`;
  return `\n\n[[${title}]] is in your Inbox now. Open it from the row above, or undo this chat's changes below.`;
}

/** The card's body. */
export const cardBody = (asked: string) => `Made by the preview's chat to show a tool call; in the app, the model decides what a card says.\n\n> ${asked.trim().replace(/\s*\n\s*/g, " ")}\n`;

const SIZES = [4, 7, 3, 8, 5, 6];

/** Text in the small, uneven pieces a model streams. */
export function pieces(text: string): string[] {
  const out: string[] = [];
  for (let at = 0, i = 0; at < text.length; i++) {
    const size = SIZES[i % SIZES.length]!;
    out.push(text.slice(at, at + size));
    at += size;
  }
  return out;
}
