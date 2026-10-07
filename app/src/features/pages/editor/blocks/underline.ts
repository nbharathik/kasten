import type { RemarkProcessor } from "../remark-context";
// Underline, which Markdown lacks, stored as inline HTML that other tools
// render too: `<u>text</u>`. Ctrl+U toggles it, as in Notion.

import { $markSchema, $remark } from "@milkdown/kit/utils";

import { groupHtmlPairs, htmlPairHandler, type HtmlPair } from "./inline-html";
import { eachParent, type MdNode } from "./mdast";

const underlineTags: HtmlPair<true> = {
  open: (html) => (/^<u\s*>$/i.test(html) ? true : null),
  nests: (html) => /^<u[\s>]/i.test(html),
  close: (html) => /^<\/u\s*>$/i.test(html),
  build: (_info, children) => ({ type: "kastenUnderline", children }),
};

const kastenUnderline = htmlPairHandler(() => "<u>", "</u>");


export const remarkUnderline = $remark("kastenUnderline", () => function (this: RemarkProcessor) {
  const data = this.data();
  (data.toMarkdownExtensions ??= []).push({ handlers: { kastenUnderline } });
  return (tree: unknown) => {
    eachParent(tree as MdNode, (parent) => {
      if (parent.children.some((c) => c.type === "html")) parent.children = groupHtmlPairs(parent.children, underlineTags);
    });
  };
});

export const underlineSchema = $markSchema("underline", () => ({
  parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
  toDOM: () => ["u", 0],
  parseMarkdown: {
    match: (node) => node.type === "kastenUnderline",
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "underline",
    runner: (state, mark) => {
      state.withMark(mark, "kastenUnderline");
    },
  },
}));
