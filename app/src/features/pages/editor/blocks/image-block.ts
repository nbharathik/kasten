// A picture on a line of its own. Crepe keeps its size in the alt text,
// `![1.50](photo.jpg)`, so writing the block again replaced a picture's alt
// text. Here the alt text is an attribute
// of its own and always written back; a size goes into the alt text only for
// a picture that has none, as Crepe writes it.

import { imageBlockSchema } from "@milkdown/kit/component/image-block";

/** Crepe's size: a number with two decimals. */
const SIZE = /^\d+\.\d{2}$/;

/** Crepe's picture block with its alt text kept. Use after Crepe's own. */
export const imageBlock = imageBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, alt: { default: "", validate: "string" } },
    parseDOM: [
      {
        tag: 'img[data-type="image-block"]',
        getAttrs: (dom) =>
          dom instanceof HTMLElement
            ? {
                src: dom.getAttribute("src") ?? "",
                caption: dom.getAttribute("caption") ?? "",
                ratio: Number(dom.getAttribute("ratio") ?? 1) || 1,
                alt: dom.getAttribute("alt") ?? "",
              }
            : false,
      },
    ],
    parseMarkdown: {
      match: ({ type }) => type === "image-block",
      runner: (state, node, type) => {
        const alt = typeof node.alt === "string" ? node.alt : "";
        const size = SIZE.test(alt) ? Number(alt) : 1;
        state.addNode(type, {
          src: typeof node.url === "string" ? node.url : "",
          caption: typeof node.title === "string" ? node.title : "",
          ratio: size > 0 ? size : 1,
          alt: SIZE.test(alt) ? "" : alt,
        });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "image-block",
      runner: (state, node) => {
        const ratio = Number(node.attrs.ratio);
        const size = Number.isFinite(ratio) && ratio > 0 && ratio !== 1 ? ratio.toFixed(2) : "";
        state.openNode("paragraph");
        state.addNode("image", undefined, undefined, { title: node.attrs.caption, url: node.attrs.src, alt: node.attrs.alt || size });
        state.closeNode();
      },
    },
  };
});
