// Writes the dev vault's sample PDF, fixtures/dev-vault/sources/
// zettelkasten-primer.pdf, and its sidecar of highlights. The text is our
// own; the fonts are PDF's standard Helvetica, so nothing is embedded. The
// layout uses Helvetica's metrics, so the sample highlights' rectangles sit
// exactly on their words. Deterministic: run it again, get the same bytes.
//
//   node scripts/sample-pdf.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "fixtures/dev-vault/sources");

// Advance widths per 1000 units, ASCII 32-126 (Adobe's Helvetica AFMs).
// prettier-ignore
const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

const FONTS = { F1: REGULAR, F2: BOLD };
const width = (text, font, size) => ([...text].reduce((sum, c) => sum + (FONTS[font][c.charCodeAt(0) - 32] ?? 556), 0) * size) / 1000;

const PAGE = { width: 595, height: 842, left: 72, top: 770, bottom: 80 };
const MEASURE = PAGE.width - 2 * PAGE.left;

const BLOCKS = [
  { kind: "title", text: "A Zettelkasten primer" },
  { kind: "note", text: "How small, linked notes turn reading into writing. A sample for the Kasten dev vault." },
  { kind: "body", text: "A Zettelkasten, or slip box, is a way of keeping notes so that they keep working after you write them. Each note is small, written in your own words and linked to the notes it belongs with. Over time the links, not the folders, become the structure of what you know." },
  { kind: "heading", text: "1. One idea per note" },
  { kind: "body", text: "A note should hold one idea, written in your own words, so that it can be understood without the context it came from. Small notes are easy to link, easy to move and easy to reuse in a new argument. When a note grows a second idea, split it in two and link the halves." },
  { kind: "heading", text: "2. Link as you write" },
  { kind: "body", text: "Every new note is placed next to the notes it belongs with. Ask which existing note it continues, contradicts or supports, and link it there. Links are cheaper than folders: a note can sit in many conversations at once, and each link records why two ideas meet." },
  { kind: "heading", text: "3. Let structure emerge" },
  { kind: "body", text: "Do not design the structure before the notes exist. Clusters of densely linked notes become topics of their own, and an index note that points to the entry points of each cluster is enough to find your way back in. Structure is the result of the work, not its precondition." },
  { kind: "page" },
  { kind: "heading", text: "4. From reading to writing" },
  { kind: "body", text: "Highlight while you read, then turn the passages that matter into notes of your own. Keep the reference to the source with every note, so you can always return to the page an idea came from and read it again in context." },
  { kind: "body", text: "A highlight is not yet a note. It becomes one when you say, in a sentence of your own, why the passage matters and where it leads. That sentence is the start of the next note." },
  { kind: "heading", text: "5. Review and revisit" },
  { kind: "body", text: "Read old notes when you write new ones. A note you revisit gets better links and clearer wording, and ideas you had forgotten meet the ones you are working on today. The value of the box grows with the connections between its notes, not with their number." },
  { kind: "note", text: "Written for the Kasten sample vault. Select any passage to highlight it, then make it a card." },
];

const STYLE = {
  title: { font: "F2", size: 24, leading: 30, before: 0, gray: 0.1 },
  note: { font: "F1", size: 10.5, leading: 15, before: 6, gray: 0.45 },
  heading: { font: "F2", size: 13.5, leading: 18, before: 18, gray: 0.1 },
  body: { font: "F1", size: 11.5, leading: 17, before: 8, gray: 0.15 },
};

/** Words into lines no wider than the measure. */
function wrap(text, font, size) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next, font, size) > MEASURE) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Lay out: pages of lines, each with where its text starts in its block.
const pages = [[]];
const placed = [];
let y = PAGE.top;
for (const block of BLOCKS) {
  if (block.kind === "page") {
    pages.push([]);
    y = PAGE.top;
    continue;
  }
  const style = STYLE[block.kind];
  const lines = wrap(block.text, style.font, style.size);
  if (y !== PAGE.top) y -= style.before;
  let offset = 0;
  const done = [];
  for (const text of lines) {
    if (y < PAGE.bottom) {
      pages.push([]);
      y = PAGE.top;
    }
    const line = { text, x: PAGE.left, y, page: pages.length, offset, ...style };
    pages[pages.length - 1].push(line);
    done.push(line);
    offset += text.length + 1;
    y -= style.leading;
  }
  placed.push({ block, lines: done });
}

const escape = (text) => text.replace(/[\\()]/g, (c) => `\\${c}`);
const num = (n) => String(Math.round(n * 100) / 100);

function stream(lines) {
  return lines.map((l) => `BT ${num(l.gray)} g /${l.font} ${num(l.size)} Tf 1 0 0 1 ${num(l.x)} ${num(l.y)} Tm (${escape(l.text)}) Tj ET`).join("\n") + "\n";
}

// The document, object by object; offsets come from the bytes written.
const objects = [];
const add = (body) => objects.push(body) && objects.length;
const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
add(null); // the page tree, once its kids are known
const regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
const kids = pages.map((lines) => {
  const body = stream(lines);
  const contents = add(`<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}endstream`);
  return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${contents} 0 R >>`);
});
objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
const info = add("<< /Title (A Zettelkasten primer) /Author (Kasten sample vault) /Producer (scripts/sample-pdf.mjs) >>");

let pdf = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(join(out, "zettelkasten-primer.pdf"), Buffer.from(pdf, "latin1"));

/** A highlight on `phrase`: one rectangle per line it spans, in PDF points. */
function highlight(id, phrase, color, comment, created) {
  for (const { block, lines } of placed) {
    const at = block.text.indexOf(phrase);
    if (at < 0) continue;
    const end = at + phrase.length;
    const rects = lines
      .filter((l) => l.offset < end && l.offset + l.text.length > at)
      .map((l) => {
        const from = Math.max(at - l.offset, 0);
        const to = Math.min(end - l.offset, l.text.length);
        const x1 = l.x + width(l.text.slice(0, from), l.font, l.size);
        const x2 = l.x + width(l.text.slice(0, to), l.font, l.size);
        return [x1, l.y - 0.22 * l.size, x2, l.y + 0.8 * l.size].map((n) => Math.round(n * 100) / 100);
      });
    const page = lines.find((l) => l.offset < end && l.offset + l.text.length > at).page;
    return { id, page, rects, text: phrase, color, ...(comment ? { comment } : {}), created };
  }
  throw new Error(`Not in the text: ${phrase}`);
}

const highlights = [
  highlight("01K5ZK00000000000000000001", "A note should hold one idea, written in your own words, so that it can be understood without the context it came from.", "yellow", "The rule the rest follows from.", "2026-09-20T09:12:00Z"),
  highlight("01K5ZK00000000000000000002", "Structure is the result of the work, not its precondition.", "purple", null, "2026-09-20T09:14:00Z"),
  highlight("01K5ZK00000000000000000003", "Keep the reference to the source with every note, so you can always return to the page an idea came from", "green", "Exactly what a highlight card does.", "2026-09-21T17:40:00Z"),
];
const sidecar = `{\n  "title": "A Zettelkasten primer",\n  "highlights": [\n${highlights.map((h) => `    ${JSON.stringify(h)}`).join(",\n")}\n  ]\n}\n`;
writeFileSync(join(out, "zettelkasten-primer.highlights.json"), sidecar);
console.log(`${pages.length} pages, ${highlights.length} highlights`);
