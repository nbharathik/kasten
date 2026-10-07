// The stylesheet a slide is drawn with, made ready for a picture of it. The page
// has the renderer's rules already (SlideView imports them) and the bundled fonts
// beside them. An SVG that is drawn as an image loads nothing from outside, so the
// fonts the slide's text uses go into its style as data URLs.

import { type FontReader, fontUrl, readFont } from "./katex-css.ts";

/** One `@font-face` of the page. */
export interface SlideFace {
  family: string;
  weight: string;
  style: string;
  /** The `unicode-range` that says which characters the face has: bundled fonts come in a face for each script. Empty for all of them. */
  range: string;
  /** Where the browser found the font: the woff2 file when there is one. */
  url: string;
}

/** What is read of the page: the rules of the slide and its text, and every font face. */
export interface SlideSheet {
  rules: string[];
  faces: SlideFace[];
}

const FONT_FACE_RULE = 5;
const STYLE_RULE = 1;

/** The rules that draw a slide and its text; the editor's own rules are left out. */
const SLIDE_SELECTOR = /\.ks-(?:slide|text)\b/;

/** Names that stand for whatever font the system has, not a font to embed. */
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong", "inherit", "initial", "unset"]);

const unquote = (value: string): string => value.replace(/^["']|["']$/g, "").trim();

function collect(rules: CSSRuleList, into: SlideSheet): void {
  for (const rule of Array.from(rules)) {
    if (rule.type === FONT_FACE_RULE) {
      const { style } = rule as CSSFontFaceRule;
      const family = unquote(style.getPropertyValue("font-family"));
      // The address is in the declarations, or failing that in the text of the rule.
      const url = fontUrl(style.getPropertyValue("src") || /\bsrc:\s*([^;}]*)/.exec(rule.cssText)?.[1] || "");
      const range = style.getPropertyValue("unicode-range") || /unicode-range:\s*([^;}]*)/.exec(rule.cssText)?.[1]?.trim() || "";
      if (family && url) into.faces.push({ family, url, range, weight: style.getPropertyValue("font-weight") || "normal", style: style.getPropertyValue("font-style") || "normal" });
    } else if (rule.type === STYLE_RULE) {
      if (SLIDE_SELECTOR.test((rule as CSSStyleRule).selectorText)) into.rules.push(rule.cssText);
    } else if ("cssRules" in rule && rule.cssRules) {
      collect(rule.cssRules as CSSRuleList, into);
    }
  }
}

/** The slide's rules and the page's fonts as the page has them. A sheet from another origin cannot be read and is skipped. */
export function readSlideSheet(sheets: ArrayLike<CSSStyleSheet> = document.styleSheets): SlideSheet {
  const found: SlideSheet = { rules: [], faces: [] };
  for (const sheet of Array.from(sheets)) {
    try {
      collect(sheet.cssRules, found);
    } catch {
      // A stylesheet from another origin cannot be read.
    }
  }
  return found;
}

/** The names in a `font-family` value, in order: `Inter, "Helvetica Neue", sans-serif` is three. */
function namesIn(value: string): string[] {
  const names: string[] = [];
  let current = "";
  let quote = "";
  for (const char of value) {
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ",") {
      names.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  names.push(current.trim());
  return names.filter(Boolean);
}

/** The font stacks the markup sets, one for each element that names any. */
export function fontStacksIn(html: string): string[][] {
  const holder = document.createElement("template");
  holder.innerHTML = html;
  const stacks: string[][] = [];
  for (const element of Array.from(holder.content.querySelectorAll<HTMLElement>("[style]"))) {
    const names = namesIn(element.style.fontFamily);
    if (names.length > 0) stacks.push(names);
  }
  return stacks;
}

/** Every font family the markup names, first choices and fallbacks alike. */
export function fontFamiliesIn(html: string): Set<string> {
  return new Set(fontStacksIn(html).flat());
}

export interface SlideStyleOptions {
  sheets?: ArrayLike<CSSStyleSheet>;
  reader?: FontReader;
}

export interface SlideStyles {
  css: string;
  /** Families a stack asks for first that could not be embedded, so the picture is set in a font the system chose. */
  missing: string[];
}

/**
 * The CSS to draw the slide whose markup this is, all in one piece: the renderer's
 * rules, and a `@font-face` with the font inline for each face of each family the
 * markup names.
 */
export async function slideStyles(html: string, { sheets, reader = readFont }: SlideStyleOptions = {}): Promise<SlideStyles> {
  const sheet = readSlideSheet(sheets);
  const stacks = fontStacksIn(html);
  const wanted = new Set(stacks.flat().map((name) => name.toLowerCase()));
  const faces = sheet.faces.filter((face) => wanted.has(face.family.toLowerCase()));
  const data = await Promise.all(faces.map((face) => reader(face.url)));
  const embedded = new Set<string>();
  const drawn = faces.flatMap((face, i) => {
    const url = data[i];
    if (!url) return [];
    embedded.add(face.family.toLowerCase());
    const range = face.range ? `unicode-range:${face.range};` : "";
    return [`@font-face{font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style};${range}src:url("${url}")}`];
  });
  // A stack's first family is the one wanted; the rest are what to fall back on.
  const missing = [...new Set(stacks.map((stack) => stack[0] as string))].filter((name) => !GENERIC.has(name.toLowerCase()) && !embedded.has(name.toLowerCase()));
  return { css: [...drawn, ...sheet.rules].join("\n"), missing };
}
