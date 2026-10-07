import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { importPdfs, MAX_PDF_BYTES } from "./import";

beforeEach(() => {
  useWorkspace.setState({ client: new MemoryVault({}), toasts: [] });
});

describe("importing PDFs", () => {
  it("refuses a PDF over the limit without reading it", async () => {
    const file = new File(["%PDF-1.7"], "Huge scan.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: MAX_PDF_BYTES + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    expect(await importPdfs([file])).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    expect(useWorkspace.getState().toasts.map((t) => t.text)).toEqual(["“Huge scan.pdf” was not imported: it is over 100 MB"]);
  });
});
