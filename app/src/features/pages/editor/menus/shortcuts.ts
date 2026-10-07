// Notion's Markdown-style typing shortcuts. Milkdown already turns `# `, `- `,
// `1. ` and ``` into blocks; Kasten adds Notion's own: `[] ` to-do, `> `
// toggle, `" ` quote, and arrows for `->`, `<-` and `=>`.

import { editorStateOptionsCtx, inputRulesCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { customInputRules } from "@milkdown/kit/prose";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { EditorState } from "@milkdown/kit/prose/state";
import { $inputRule } from "@milkdown/kit/utils";

import { chain, turnInto } from "./transform";
import type { BlockKind } from "./catalog";

/** Milkdown's blockquote rule: `> ` makes a toggle here, as in Notion. */
const DROPPED = new Set([String.raw`^\s*>\s$`]);

/** Swaps Milkdown's input rules plugin for one without the dropped rules. */
export function configureInputRules(ctx: Ctx): void {
  ctx.update(editorStateOptionsCtx, (prev) => (options) => {
    const next = prev(options);
    // `match` is public at runtime but left out of prosemirror-inputrules' types.
    const rules = ctx.get(inputRulesCtx).filter((rule) => !DROPPED.has((rule as unknown as { match: RegExp }).match.source));
    const plugins = next.plugins?.map((plugin) =>
      (plugin.spec as { isInputRules?: boolean }).isInputRules ? customInputRules({ rules }) : plugin,
    );
    return { ...next, plugins };
  });
}

/** A rule that turns the block into `kind` when its text starts with `pattern`. */
const blockRule = (pattern: RegExp, kind: BlockKind) =>
  $inputRule(() => new InputRule(pattern, (state, _match, start, end) => chain(state, [turnInto(kind)], state.tr.delete(start, end))));

export const todoInputRule = blockRule(/^\[\s?\]\s$/, "todo");
export const toggleInputRule = blockRule(/^>\s$/, "toggle");
export const quoteInputRule = blockRule(/^"\s$/, "quote");

const inCode = (state: EditorState, pos: number) => state.doc.resolve(pos).marks().some((m) => m.type.name === "inlineCode");

/** Replaces the typed characters with a symbol, outside inline code. */
const symbolRule = (pattern: RegExp, symbol: string) =>
  $inputRule(
    () =>
      new InputRule(pattern, (state, match, start, end) => {
        if (inCode(state, start)) return null;
        const keep = match[1] ?? "";
        return state.tr.insertText(keep + symbol, start, end);
      }),
  );

export const arrowRules = [
  symbolRule(/(^|[^<-])->$/, "→"),
  symbolRule(/(^|[^-])<-$/, "←"),
  symbolRule(/(^|[^=<>!])=>$/, "⇒"),
];

/** Typing `]]` after `[[Title` makes the link, as when picked from the menu. */
export const wikiLinkInputRule = $inputRule(
  () =>
    new InputRule(/\[\[([^[\]\n]+)\]\]$/, (state, match, start, end) => {
      const type = state.schema.nodes.wiki_link;
      if (!type || inCode(state, start)) return null;
      return state.tr.replaceWith(start, end, type.create({ value: match[1]!, embed: false }));
    }),
);
