// The stylesheet a KaTeX formula is drawn with, made ready for a picture of it.
// The page has KaTeX's rules already (MathView imports them, and the bundler
// puts the fonts beside them). An SVG that is drawn as an image loads nothing
// from outside, so the fonts the formula uses go into its style as data URLs.

/** One `@font-face` of KaTeX. */
export interface KatexFace {
  family: string;
  weight: string;
  style: string;
  /** Where the browser found the font: the woff2 file when there is one. */
  url: string;
}

/** One rule of KaTeX's that names a font, and what it applies to. */
interface FontRule {
  /** The classes each of its selectors needs, so the rule can be told to matter or not from the markup. */
  needs: string[][];
  families: string[];
}

/** What is read of the page: every rule KaTeX has, the ones that pick a font, and the faces. */
export interface KatexSheet {
  rules: string[];
  fontRules: FontRule[];
  faces: KatexFace[];
}

const FONT_FACE_RULE = 5;
const STYLE_RULE = 1;

const familiesIn = (value: string): string[] => [...value.matchAll(/KaTeX_[A-Za-z0-9]+/g)].map((match) => match[0]);
const classesIn = (selector: string): string[] => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1] as string);

/** The address of the font to draw with among a `src` list: woff2 if it is there, else the first. */
export function fontUrl(src: string): string | null {
  const sources = [...src.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)\s*(?:format\(\s*(["']?)([\w-]+)\3\s*\))?/g)].map((match) => ({ url: match[2] as string, format: match[4] ?? "" }));
  return (sources.find((source) => source.format === "woff2") ?? sources[0])?.url ?? null;
}

function collect(rules: CSSRuleList, into: KatexSheet): void {
  for (const rule of Array.from(rules)) {
    if (rule.type === FONT_FACE_RULE) {
      const { style } = rule as CSSFontFaceRule;
      const family = style.getPropertyValue("font-family").replace(/["']/g, "").trim();
      // The address is in the declarations, or failing that in the text of the rule.
      const url = fontUrl(style.getPropertyValue("src") || /\bsrc:\s*([^;}]*)/.exec(rule.cssText)?.[1] || "");
      if (family.startsWith("KaTeX_") && url) into.faces.push({ family, url, weight: style.getPropertyValue("font-weight") || "normal", style: style.getPropertyValue("font-style") || "normal" });
    } else if (rule.type === STYLE_RULE) {
      const { selectorText, style } = rule as CSSStyleRule;
      if (!selectorText.includes(".katex")) continue;
      into.rules.push(rule.cssText);
      const families = familiesIn(`${style.getPropertyValue("font-family")} ${style.getPropertyValue("font")}`);
      if (families.length > 0) into.fontRules.push({ families, needs: selectorText.split(",").map(classesIn) });
    } else if ("cssRules" in rule && rule.cssRules) {
      collect(rule.cssRules as CSSRuleList, into);
    }
  }
}

/** KaTeX's rules and fonts as the page has them; null when the page has none (or keeps them where a script may not read). */
export function readKatexSheet(sheets: ArrayLike<CSSStyleSheet> = document.styleSheets): KatexSheet | null {
  const found: KatexSheet = { rules: [], fontRules: [], faces: [] };
  for (const sheet of Array.from(sheets)) {
    try {
      collect(sheet.cssRules, found);
    } catch {
      // A stylesheet from another origin cannot be read.
    }
  }
  return found.rules.length > 0 && found.faces.length > 0 ? found : null;
}

/** Every class that appears in the markup. */
export const classesOf = (html: string): Set<string> => new Set([...html.matchAll(/\bclass="([^"]*)"/g)].flatMap((match) => (match[1] as string).split(/\s+/)).filter(Boolean));

/**
 * The families of font a formula's markup can need: the ones KaTeX's rules give
 * to classes the markup has, and the main one, which every formula sets in.
 */
export function familiesUsed(html: string, sheet: KatexSheet): Set<string> {
  const classes = classesOf(html);
  const used = new Set(["KaTeX_Main"]);
  for (const rule of sheet.fontRules) {
    if (rule.needs.some((needs) => needs.every((name) => classes.has(name) || name === "katex"))) for (const family of rule.families) used.add(family);
  }
  return used;
}

const isRegularMain = (face: KatexFace): boolean => face.family === "KaTeX_Main" && /^(400|normal)$/.test(face.weight) && face.style === "normal";

/** A font's file as a data URL; null when it cannot be read. */
export type FontReader = (url: string) => Promise<string | null>;

const read = new Map<string, Promise<string | null>>();

/** Reads a font from where the page got it. Kept, so a deck of many formulas asks for each file once. */
export const readFont: FontReader = (url) => {
  let known = read.get(url);
  if (!known) {
    known = fetch(url, { cache: "force-cache" })
      .then((response) => (response.ok ? response.blob() : null))
      .then(
        (blob) =>
          blob &&
          new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => null);
    read.set(url, known);
  }
  return known;
};

export interface KatexStyleOptions {
  sheets?: ArrayLike<CSSStyleSheet>;
  reader?: FontReader;
}

/**
 * The CSS to draw the formula whose markup this is, all in one piece: KaTeX's
 * rules, and a `@font-face` with the font inline for each family the markup can
 * use. Null when the page does not have KaTeX's rules, or the main font cannot
 * be read: a picture without them would be set in whatever the browser has.
 */
export async function katexStyles(html: string, { sheets, reader = readFont }: KatexStyleOptions = {}): Promise<string | null> {
  const sheet = readKatexSheet(sheets);
  if (!sheet) return null;
  const used = familiesUsed(html, sheet);
  const faces = sheet.faces.filter((face) => used.has(face.family));
  const data = await Promise.all(faces.map((face) => reader(face.url)));
  const drawn = faces.flatMap((face, i) => {
    const url = data[i];
    return url ? [`@font-face{font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style};src:url("${url}")}`] : [];
  });
  // Without its main font, the regular one, a formula is not KaTeX's.
  if (!faces.some((face, i) => isRegularMain(face) && data[i])) return null;
  return [...drawn, ...sheet.rules].join("\n");
}
