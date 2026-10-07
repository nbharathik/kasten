// Writes the dev vault's second sample PDF, fixtures/dev-vault/sources/
// paper-with-figures.pdf, with its sidecar and its bibliography entry: a
// two-page paper with three figures to clip. Figure 1 is a diagram of boxes and
// arrows, figure 2 a bar chart (both vector drawings) and figure 3 a bitmap.
// The text is our own; the fonts are PDF's standard Helvetica, so nothing is
// embedded. Deterministic (integers only, no compression): run it again, get
// the same bytes.
//
//   node scripts/figures-pdf.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The figures, where they are on their pages: `rect` is `[x1, y1, x2, y2]` in PDF points from the page's bottom left, the frame around each one. */
export const FIGURES = [
  { name: "Figure 1", page: 1, rect: [72, 440, 523, 610], caption: "From reading to a cited slide." },
  { name: "Figure 2", page: 2, rect: [72, 480, 300, 690], caption: "Accuracy by model size." },
  { name: "Figure 3", page: 2, rect: [320, 480, 523, 690], caption: "An attention map, as a bitmap." },
];

/** The colours the figures are drawn in, so a picture clipped from them can be checked. */
export const COLORS = {
  read: [76, 120, 168],
  highlight: [245, 133, 24],
  clip: [84, 162, 75],
  cite: [178, 121, 162],
  bars: [
    [76, 120, 168],
    [245, 133, 24],
    [84, 162, 75],
    [178, 121, 162],
    [228, 87, 86],
  ],
};

/** Where the drawings are inside their frames, in points: the four boxes of figure 1, the five bars of figure 2 and the bitmap of figure 3. */
export const STEPS = { x: 84, pitch: 114, y: 500, width: 84, height: 56 };
export const BARS = { x: 120, pitch: 33, y: 510, width: 24, heights: [40, 70, 95, 110, 118] };
export const BITMAP = { x: FIGURES[2].rect[0] + 16.5, y: FIGURES[2].rect[1] + 8, size: 170 };

/** The bitmap of figure 3: a heat map of 8 by 8 blocks, each 8 pixels square. */
export const HEAT = { blocks: 8, block: 8 };

/** The colour of the heat map's block (bx, by), from integers only. */
export function heat(bx, by) {
  const v = (bx * 37 + by * 91 + bx * by * 13) % 256;
  const byte = (n) => Math.max(0, Math.min(255, n));
  return [byte(v * 2), byte(255 - Math.abs(v - 128) * 2), byte(255 - v * 2)];
}

/** Where the paper is kept in the vault, and what it is called. */
export const PAPER = {
  file: "paper-with-figures",
  title: "A sample paper with three figures",
  key: "sample2026figures",
  authors: ["Sample, Kasten", "Vault, Dev"],
  year: "2026",
};

// Advance widths per 1000 units, ASCII 32-126 (Adobe's Helvetica AFMs).
// prettier-ignore
const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,556,556,778,556,556,500,389,280,389,584];
const FONTS = { F1: REGULAR, F2: BOLD };
const width = (text, font, size) => ([...text].reduce((sum, c) => sum + (FONTS[font][c.charCodeAt(0) - 32] ?? 556), 0) * size) / 1000;

const PAGE = { width: 595, height: 842 };
const num = (n) => String(Math.round(n * 100) / 100);
const colour = (rgb) => rgb.map((c) => num(c / 255)).join(" ");
const escape = (text) => text.replace(/[\\()]/g, (c) => `\\${c}`);

/** A little drawing language over content-stream operators. */
class Sheet {
  ops = [];
  text(font, size, x, y, string, rgb = [38, 38, 38]) {
    this.ops.push(`BT ${colour(rgb)} rg /${font} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm (${escape(string)}) Tj ET`);
  }
  centred(font, size, cx, y, string, rgb) {
    this.text(font, size, cx - width(string, font, size) / 2, y, string, rgb);
  }
  box(x, y, w, h, fill) {
    this.ops.push(`${colour(fill)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }
  frame(x, y, w, h, rgb = [166, 166, 166]) {
    this.ops.push(`${colour(rgb)} RG 0.75 w ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`);
  }
  line(x1, y1, x2, y2, rgb = [38, 38, 38], w = 1) {
    this.ops.push(`${colour(rgb)} RG ${num(w)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }
  arrow(x1, x2, y) {
    this.line(x1, y, x2 - 7, y, [90, 90, 90], 2);
    this.ops.push(`${colour([90, 90, 90])} rg ${num(x2)} ${num(y)} m ${num(x2 - 9)} ${num(y + 5)} l ${num(x2 - 9)} ${num(y - 5)} l h f`);
  }
  raw(op) {
    this.ops.push(op);
  }
  stream() {
    return `${this.ops.join("\n")}\n`;
  }
}

/** Lines of body text, from the top. */
function body(sheet, x, y, lines, size = 11, leading = 16) {
  lines.forEach((line, i) => sheet.text("F1", size, x, y - i * leading, line, [46, 46, 46]));
}

function pageOne() {
  const s = new Sheet();
  s.text("F2", 22, 72, 770, PAPER.title, [26, 26, 26]);
  s.text("F1", 10.5, 72, 748, "Kasten Sample and Dev Vault, 2026. Written for the Kasten dev vault.", [115, 115, 115]);
  s.text("F2", 12, 72, 716, "Abstract");
  body(s, 72, 698, [
    "Notes are worth most when the figures they rest on can be found again.",
    "This short sample paper has three figures, two drawn with lines and one",
    "as a bitmap, so that a clip tool has something to cut out and cite.",
  ]);
  s.text("F2", 13.5, 72, 640, "1. A pipeline");
  body(s, 72, 620, ["Figure 1 shows the four steps from reading a paper to a cited slide."]);
  const [x1, y1, x2, y2] = FIGURES[0].rect;
  s.frame(x1, y1, x2 - x1, y2 - y1);
  s.text("F2", 10, x1 + 12, y2 - 20, "Pipeline");
  const steps = [
    ["Read", COLORS.read, "sources/"],
    ["Highlight", COLORS.highlight, "cards"],
    ["Clip", COLORS.clip, "gallery"],
    ["Cite", COLORS.cite, "slides"],
  ];
  steps.forEach(([label, fill, where], i) => {
    const x = STEPS.x + i * STEPS.pitch;
    s.box(x, STEPS.y, STEPS.width, STEPS.height, fill);
    s.centred("F2", 12, x + STEPS.width / 2, STEPS.y + 24, label, [255, 255, 255]);
    s.centred("F1", 9, x + STEPS.width / 2, STEPS.y - 18, where, [115, 115, 115]);
    if (i < steps.length - 1) s.arrow(x + STEPS.width, x + STEPS.pitch - 3, STEPS.y + 28);
  });
  s.text("F1", 10, 72, 420, `${FIGURES[0].name}. ${FIGURES[0].caption}`, [90, 90, 90]);
  body(s, 72, 390, [
    "Each step keeps a link to the one before it: a clip remembers its page and",
    "its rectangle, and a slide that shows the clip cites the paper it came from.",
  ]);
  return s;
}

function pageTwo() {
  const s = new Sheet();
  s.text("F2", 13.5, 72, 770, "2. Results");
  body(s, 72, 750, ["Figure 2 compares five model sizes. Figure 3 shows where the model looked."]);
  // Figure 2: a bar chart.
  const [a1, b1, a2, b2] = FIGURES[1].rect;
  s.frame(a1, b1, a2 - a1, b2 - b1);
  s.text("F2", 10, a1 + 12, b2 - 20, "Accuracy (%)");
  s.line(110, 510, 285, 510);
  s.line(110, 510, 110, 660);
  [0, 50, 100].forEach((tick, i) => {
    s.text("F1", 8, 92, 507 + i * 60, String(tick), [90, 90, 90]);
    if (i > 0) s.line(110, 510 + i * 60, 285, 510 + i * 60, [217, 217, 217], 0.5);
  });
  BARS.heights.forEach((high, i) => {
    const x = BARS.x + i * BARS.pitch;
    s.box(x, BARS.y, BARS.width, high, COLORS.bars[i]);
    s.centred("F1", 9, x + BARS.width / 2, BARS.y - 14, ["S", "M", "L", "XL", "XXL"][i], [90, 90, 90]);
  });
  // Figure 3: a bitmap.
  const [c1, d1, c2, d2] = FIGURES[2].rect;
  s.frame(c1, d1, c2 - c1, d2 - d1);
  s.text("F2", 10, c1 + 12, d2 - 20, "Attention map");
  s.raw(`q ${BITMAP.size} 0 0 ${BITMAP.size} ${BITMAP.x} ${BITMAP.y} cm /Im1 Do Q`);
  s.text("F1", 10, 72, 460, `${FIGURES[1].name}. ${FIGURES[1].caption}`, [90, 90, 90]);
  s.text("F1", 10, 320, 460, `${FIGURES[2].name}. ${FIGURES[2].caption}`, [90, 90, 90]);
  body(s, 72, 420, [
    "Larger models are more accurate, and the gain flattens at the top. The map",
    "is coarse on purpose: each block stands for a group of words.",
  ]);
  return s;
}

/** The bitmap's bytes: RGB, one row after another, from the top. */
function heatBitmap() {
  const size = HEAT.blocks * HEAT.block;
  const bytes = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) bytes.push(...heat(Math.floor(x / HEAT.block), Math.floor(y / HEAT.block)));
  }
  return String.fromCharCode(...bytes);
}

/** The PDF, its sidecar of highlights and its bibliography entry, as text. `rotate` turns the pages (a multiple of 90) the way a scanned or landscape paper is. */
export function build({ rotate = 0 } = {}) {
  const bitmap = heatBitmap();
  const pages = [pageOne(), pageTwo()];
  const objects = [];
  const add = (object) => objects.push(object) && objects.length;
  const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
  add(null); // the page tree, once its kids are known
  const regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const size = HEAT.blocks * HEAT.block;
  const image = add(`<< /Type /XObject /Subtype /Image /Width ${size} /Height ${size} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${bitmap.length} >>\nstream\n${bitmap}\nendstream`);
  const kids = pages.map((sheet, i) => {
    const content = sheet.stream();
    const contents = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`);
    const xobjects = i === 1 ? ` /XObject << /Im1 ${image} 0 R >>` : "";
    const turned = rotate ? ` /Rotate ${rotate}` : "";
    return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}]${turned} /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >>${xobjects} >> /Contents ${contents} 0 R >>`);
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${PAPER.title}) /Author (Kasten dev vault) /Producer (scripts/figures-pdf.mjs) >>`);

  let pdf = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const sidecar = `{\n  "title": ${JSON.stringify(PAPER.title)},\n  "highlights": []\n}\n`;
  const bib =
    "% The sample paper in sources/paper-with-figures.pdf. It is made up for the dev vault,\n" +
    "% so it has an entry of its own instead of a real work's.\n\n" +
    `@techreport{${PAPER.key},\n  title       = {${PAPER.title}},\n  author      = {${PAPER.authors.join(" and ")}},\n  institution = {Kasten dev vault},\n  year        = {${PAPER.year}}\n}\n`;
  return { pdf: Buffer.from(pdf, "latin1"), sidecar, bib };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures/dev-vault/sources");
  const { pdf, sidecar, bib } = build();
  writeFileSync(join(out, `${PAPER.file}.pdf`), pdf);
  writeFileSync(join(out, `${PAPER.file}.highlights.json`), sidecar);
  writeFileSync(join(out, `${PAPER.file}.bib`), bib);
  console.log(`${PAPER.file}: 2 pages, ${FIGURES.length} figures, ${pdf.length} bytes`);
}
