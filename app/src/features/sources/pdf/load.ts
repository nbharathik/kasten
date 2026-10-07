// pdf.js for the reader, loaded with the first PDF opened: its code is big
// and many sessions never need it. Parsing runs in pdf.js's worker, off the
// window's thread. Scripts inside a PDF never run: pdf.js runs them only in
// its full viewer, which Kasten does not use.

import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");

let loading: Promise<PdfJs> | null = null;

/** pdf.js's legacy build: the same code with the newest JavaScript (such as
 * `Map.getOrInsertComputed`) filled in, which system webviews may lack. */
export function pdfjs(): Promise<PdfJs> {
  loading ??= Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJs>, import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return loading;
}

/** Opens a PDF from its bytes. pdf.js hands the buffer to its worker, so it
 * gets a copy and the caller's bytes stay usable. */
export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: bytes.slice(), verbosity: 0 });
  try {
    return await task.promise;
  } catch (err) {
    // A file that does not open leaves nothing behind in the worker.
    void task.destroy();
    throw err;
  }
}
