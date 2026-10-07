// The preview keeps pasted files as kasten-core does (crates/kasten-core/tests/assets.rs).

import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_ASSET_BYTES } from "../../../lib/vault/assets";
import { fileUrl } from "../../../lib/vault/file-url";
import { assetName } from "./assets";
import { MemoryVault } from "./memory-vault";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const bytes = (text: string) => new TextEncoder().encode(text);

afterEach(() => vi.unstubAllGlobals());

describe("preview assets", () => {
  it("slugs the stem and lowers the extension", () => {
    expect(assetName("Screenshot 2026-09-24 at 10.12.png", 3)).toEqual({ stem: "screenshot-2026-09-24-at-10-12", ext: "png" });
    expect(assetName("diagram.PNG", 3)).toEqual({ stem: "diagram", ext: "png" });
    expect(assetName("../../etc/notes.pdf", 3)).toEqual({ stem: "notes", ext: "pdf" });
    expect(assetName("C:\\Users\\me\\Trip budget.xlsx", 3)).toEqual({ stem: "trip-budget", ext: "xlsx" });
  });

  it("refuses programs, odd names, empty and huge files", () => {
    for (const name of ["setup.exe", "run.sh", "page.html", "page.HTM", "script.js", "budget.xlsm", "no-extension", ".png", "x.toolongextension"]) expect(() => assetName(name, 3), name).toThrow();
    for (const name of ["diagram.svg", "Clip.MP4", "song.m4a", "board.excalidraw", "data.csv", "note.md", "refs.bib", "data.json"]) expect(() => assetName(name, 3), name).not.toThrow();
    expect(() => assetName("empty.png", 0)).toThrow(/empty/);
    expect(() => assetName("huge.png", MAX_ASSET_BYTES + 1)).toThrow(/50 MB/);
  });

  it("reuses the same bytes and finds a free name for others", async () => {
    const vault = new MemoryVault({});
    const first = await vault.saveAsset("diagram.PNG", PNG);
    expect(first).toBe("assets/diagram.png");
    expect(await vault.saveAsset("diagram.png", PNG)).toBe(first);
    expect(await vault.saveAsset("diagram.png", bytes("other"))).toBe("assets/diagram-2.png");
    await expect(vault.saveAsset("setup.exe", PNG)).rejects.toThrow(/not files that run/);
  });

  it("shows what it keeps through object URLs", async () => {
    const made: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: (blob: Blob) => (made.push(blob), `blob:kept-${made.length}`) }));
    const vault = new MemoryVault({});
    const path = await vault.saveAsset("Route.svg", bytes("<svg/>"));
    expect(fileUrl(path)).toBe("blob:kept-1");
    expect(made[0]!.type).toBe("image/svg+xml");
  });
});
