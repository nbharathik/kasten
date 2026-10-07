import type { RemarkProcessor } from "./remark-context";
// Kasten wiki-links ([[Title]], [[Title#Heading|alias]], ![[Embed]]) for
// Milkdown: a micromark syntax extension (so backslash escapes keep working), an
// mdast bridge both ways, and a ProseMirror inline atom node.
// blocks/wikilink-view.ts draws it; menus/mention.ts completes it as you type.

import { $nodeSchema, $remark } from "@milkdown/kit/utils";

type Code = number | null;
type State = (code: Code) => State | undefined;
interface Effects {
  enter(type: string): void;
  exit(type: string): void;
  consume(code: Code): void;
}

const BANG = 33;
const OPEN = 91;
const CLOSE = 93;
const isLineEnding = (code: Code) => code !== null && code < -2;

function tokenize(effects: Effects, ok: State, nok: State): State {
  let size = 0;
  const start: State = (code) => {
    effects.enter("wikiLink");
    if (code === BANG) {
      effects.enter("wikiLinkEmbed");
      effects.consume(code);
      effects.exit("wikiLinkEmbed");
      return openFirst;
    }
    return openFirst(code);
  };
  const openFirst: State = (code) => {
    if (code !== OPEN) return nok(code);
    effects.enter("wikiLinkMarker");
    effects.consume(code);
    return openSecond;
  };
  const openSecond: State = (code) => {
    if (code !== OPEN) return nok(code);
    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.enter("wikiLinkValue");
    return value;
  };
  const value: State = (code) => {
    if (code === null || isLineEnding(code) || code === OPEN) return nok(code);
    if (code === CLOSE) {
      if (size === 0) return nok(code);
      effects.exit("wikiLinkValue");
      effects.enter("wikiLinkMarker");
      effects.consume(code);
      return closeSecond;
    }
    size++;
    effects.consume(code);
    return value;
  };
  const closeSecond: State = (code) => {
    if (code !== CLOSE) return nok(code);
    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.exit("wikiLink");
    return ok;
  };
  return start;
}

const construct = { name: "wikiLink", tokenize, add: "before" };
const syntax = { text: { [OPEN]: construct, [BANG]: construct } };

interface WikiLinkNode {
  type: "wikiLink";
  value: string;
  embed: boolean;
}

interface WikiContext {
  stack: WikiLinkNode[];
  enter(node: WikiLinkNode, token: unknown): void;
  exit(token: unknown): void;
  sliceSerialize(token: unknown): string;
}
const fromMarkdown = {
  enter: {
    wikiLink(this: WikiContext, token: unknown) {
      this.enter({ type: "wikiLink", value: "", embed: false }, token);
    },
  },
  exit: {
    wikiLinkEmbed(this: WikiContext) {
      this.stack[this.stack.length - 1]!.embed = true;
    },
    wikiLinkValue(this: WikiContext, token: unknown) {
      this.stack[this.stack.length - 1]!.value = this.sliceSerialize(token);
    },
    wikiLink(this: WikiContext, token: unknown) {
      this.exit(token);
    },
  },
};

function wikiLinkHandler(node: WikiLinkNode): string {
  return `${node.embed ? "!" : ""}[[${node.value}]]`;
}
wikiLinkHandler.peek = (node: WikiLinkNode) => (node.embed ? "!" : "[");

// Literal "[[" in text (from `\[[`) stays escaped through the text handler in
// escaping.ts, so it cannot turn into a link when saved.
const toMarkdown = { handlers: { wikiLink: wikiLinkHandler } };

export const remarkWikiLink = $remark("remarkWikiLink", () => function (this: RemarkProcessor) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
  (data.toMarkdownExtensions ??= []).push(toMarkdown);
});

export const wikiLinkSchema = $nodeSchema("wiki_link", () => ({
  group: "inline",
  inline: true,
  atom: true,
  attrs: { value: { default: "" }, embed: { default: false } },
  parseDOM: [
    {
      tag: "span[data-wiki-link]",
      getAttrs: (dom) => ({
        value: (dom as HTMLElement).dataset.wikiLink ?? "",
        embed: (dom as HTMLElement).dataset.embed === "true",
      }),
    },
  ],
  toDOM: (node) => [
    "span",
    { "data-wiki-link": node.attrs.value, "data-embed": String(node.attrs.embed), class: "wiki-link" },
    `${node.attrs.embed ? "!" : ""}[[${node.attrs.value}]]`,
  ],
  parseMarkdown: {
    match: (node) => node.type === "wikiLink",
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string, embed: node.embed as boolean });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "wiki_link",
    runner: (state, node) => {
      state.addNode("wikiLink", undefined, undefined, { value: node.attrs.value, embed: node.attrs.embed });
    },
  },
}));
