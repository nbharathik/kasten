// Reading a PDF beyond its pages: its outline, and the pages that hold a
// word, for going to a chapter or finding text in the reader.

import type { PDFDocumentProxy } from "pdfjs-dist";

export interface OutlineItem {
  title: string;
  page: number;
  depth: number;
}

type Node = { title: string; dest: unknown; items?: Node[] };

/** The PDF's outline, flattened, each entry with the page it goes to;
 * empty when the PDF has none. */
export async function readOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  // A PDF whose outline cannot be read shows none.
  const top = ((await Promise.resolve()
    .then(() => doc.getOutline())
    .catch(() => null)) ?? []) as Node[];
  const out: OutlineItem[] = [];
  const walk = async (nodes: Node[], depth: number) => {
    for (const node of nodes) {
      const page = await pageOf(doc, node.dest);
      if (page) out.push({ title: node.title.trim() || "Untitled", page, depth });
      if (node.items?.length && depth < 3) await walk(node.items, depth + 1);
    }
  };
  await walk(top, 0);
  return out;
}

/** The page a destination names, from 1; null when it names none. */
async function pageOf(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : (dest as unknown[] | null);
    const ref = explicit?.[0];
    if (typeof ref === "number") return ref + 1;
    if (ref && typeof ref === "object") return (await doc.getPageIndex(ref as never)) + 1;
  } catch {
    // A broken link in the outline goes nowhere.
  }
  return null;
}

const texts = new WeakMap<PDFDocumentProxy, Promise<string[]>>();

/** Every page's text, lower-cased, read once per document. */
function pageTexts(doc: PDFDocumentProxy): Promise<string[]> {
  let found = texts.get(doc);
  if (!found) {
    found = Promise.all(
      Array.from({ length: doc.numPages }, async (_, i) => {
        const content = await (await doc.getPage(i + 1)).getTextContent();
        return content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").toLowerCase();
      }),
    );
    texts.set(doc, found);
  }
  return found;
}

/** The pages holding `query`, with how often each does. */
export async function findPages(doc: PDFDocumentProxy, query: string): Promise<{ page: number; count: number }[]> {
  const q = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!q) return [];
  const pages = await pageTexts(doc);
  return pages.flatMap((text, i) => {
    let count = 0;
    for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + q.length)) count++;
    return count ? [{ page: i + 1, count }] : [];
  });
}
