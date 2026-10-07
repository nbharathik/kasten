// A PDF that does not open leaves nothing behind in pdf.js's worker.

import { describe, expect, it, vi } from "vitest";

const destroy = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ destroy, promise: Promise.reject(new Error("Invalid PDF structure.")) }),
}));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));

import { openPdf } from "./load";

describe("opening a PDF", () => {
  it("destroys the loading task of a file that does not open", async () => {
    await expect(openPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow("Invalid PDF structure.");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
