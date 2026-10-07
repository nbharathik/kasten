// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { MemoryHost } from "../memory-host.ts";
import { EditorSession } from "./session.ts";

// jsdom cannot draw an SVG into a canvas, so the browser's part is a stand-in that hands back three bytes.
vi.mock("../../export/raster.ts", async (original) => ({ ...(await original<typeof import("../../export/raster.ts")>()), rasterize: vi.fn(async () => Uint8Array.from([137, 80, 78])) }));

afterEach(() => vi.clearAllMocks());

async function sessionOf(title: string, slides: number): Promise<EditorSession> {
  const engine = await newDeck(title);
  const session = new EditorSession(engine, new MemoryHost(), { saveDelay: 60_000, onError: () => undefined });
  for (let i = 1; i < slides; i++) session.slides.add({ layout: "blank" });
  return session;
}

const names = (zip: Uint8Array): string[] => [...new TextDecoder("latin1").decode(zip).matchAll(/slide-\d+(?:-step-\d+)?\.png/g)].map((m) => m[0]).filter((name, i, all) => all.indexOf(name) === i);

describe("exporting slides as PNG", () => {
  it("makes one picture of the slide being edited, named for the deck and the slide", async () => {
    const session = await sessionOf("Tool use", 2);
    const { file } = await session.exports.png({ scope: "current", scale: 2, steps: "final" });
    expect(file.name).toBe(`Tool use - slide ${session.deck.slides.findIndex((s) => s.id === session.slide.id) + 1}.png`);
    expect(file.type).toBe("image/png");
    expect([...file.bytes]).toEqual([137, 80, 78]);
  });

  it("makes a zip file of the pictures when there are several", async () => {
    const session = await sessionOf("Tool use", 3);
    const { file } = await session.exports.png({ scope: "all", scale: 1, steps: "final" });
    expect(file.name).toBe("Tool use.zip");
    expect(file.type).toBe("application/zip");
    expect([...file.bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(names(file.bytes)).toEqual(["slide-01.png", "slide-02.png", "slide-03.png"]);
  });

  it("makes a single file, not a zip, of a deck of one slide", async () => {
    const session = await sessionOf("Just one", 1);
    const { file } = await session.exports.png({ scope: "all", scale: 1, steps: "final" });
    expect(file.name).toBe("Just one.png");
  });

  it("draws a slide at the scale asked for", async () => {
    const { rasterize } = await import("../../export/raster.ts");
    const session = await sessionOf("Scale", 1);
    await session.exports.png({ scope: "all", scale: 4, steps: "final" });
    expect(rasterize).toHaveBeenCalledWith(expect.any(String), expect.any(String), 960, 540, 4);
  });

  it("carries a warning for what could not be done exactly, as the other exports do", async () => {
    const { rasterize } = await import("../../export/raster.ts");
    vi.mocked(rasterize).mockResolvedValueOnce(null);
    const session = await sessionOf("Warned", 2);
    const { warnings, file } = await session.exports.png({ scope: "all", scale: 1, steps: "final" });
    expect(warnings.some((w) => /slide 1/.test(w.message))).toBe(true);
    expect(file.name).toBe("Warned.png");
  });
});
