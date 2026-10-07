import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { pageFiles } from "./page-files";

const NOW = new Date(2026, 8, 24, 10, 12, 5);
const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

beforeEach(() => useWorkspace.setState({ toasts: [] }));
afterEach(() => vi.unstubAllGlobals());

describe("a page's files", () => {
  it("keeps a pasted screenshot in assets/ and links it from the page's folder", async () => {
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: () => "blob:shot" }));
    let path = "projects/trip/plan.md";
    const files = pageFiles(new MemoryVault({}), () => path, () => NOW);
    const link = await files.save(png("image.png"));
    expect(link).toBe("../../assets/pasted-image-2026-09-24-101205.png");
    expect(files.url(link)).toBe("blob:shot");
    // A renamed page links from where it is now.
    path = "plan.md";
    expect(await files.save(png("image.png"))).toBe("assets/pasted-image-2026-09-24-101205.png");
    expect(files.url("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("says why a file cannot be kept", async () => {
    const files = pageFiles(new MemoryVault({}), () => "plan.md", () => NOW);
    await expect(files.save(new File([new Uint8Array([1])], "setup.exe"))).rejects.toThrow(/not files that run/);
    expect(useWorkspace.getState().toasts.map((t) => t.text)).toEqual([expect.stringMatching(/Cannot keep “setup.exe”: a page keeps pictures/)]);
  });
});
