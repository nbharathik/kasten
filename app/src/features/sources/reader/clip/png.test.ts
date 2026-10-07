import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";

import { describe, expect, it } from "vitest";

import { densityOf, sizeOf, withDensity } from "./png";

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, "../../../../../../fixtures/assets", name)));

const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at);
const text = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.slice(at, at + n));

/** The chunks of a PNG in order: type, data offset and length. */
function chunks(png: Uint8Array): { type: string; at: number; length: number }[] {
  const found: { type: string; at: number; length: number }[] = [];
  for (let at = 8; at + 12 <= png.length; ) {
    const length = u32(png, at);
    found.push({ type: text(png, at + 4, 4), at: at + 8, length });
    at += 12 + length;
  }
  return found;
}

describe("a PNG's density", () => {
  it("is written as a pHYs chunk right after the header, with a right checksum", () => {
    const png = fixture("wide.png");
    const dense = withDensity(png, 300);
    const list = chunks(dense);
    expect(list.map((c) => c.type)).toEqual(["IHDR", "pHYs", ...chunks(png).slice(1).map((c) => c.type)]);
    const phys = list[1]!;
    expect(phys.length).toBe(9);
    // 300 dots an inch is 11811 dots a metre, in both directions, and the unit is the metre.
    expect([u32(dense, phys.at), u32(dense, phys.at + 4), dense[phys.at + 8]]).toEqual([11811, 11811, 1]);
    expect(u32(dense, phys.at + 9)).toBe(crc32(dense.slice(phys.at - 4, phys.at + 9)));
    expect(dense.length).toBe(png.length + 21);
  });

  it("leaves every other byte of the picture as it was", () => {
    const png = fixture("wide.png");
    const dense = withDensity(png, 300);
    expect(dense.slice(0, 33)).toEqual(png.slice(0, 33));
    expect(dense.slice(33 + 21)).toEqual(png.slice(33));
  });

  it("reads back as the dpi it was given, and the picture keeps its size", () => {
    const dense = withDensity(fixture("wide.png"), 300);
    expect(densityOf(dense)).toBe(300);
    expect(densityOf(withDensity(fixture("pixel.png"), 144))).toBe(144);
    expect(sizeOf(dense)).toEqual({ width: 640, height: 160 });
  });

  it("says nothing of density for a picture that does not have it", () => {
    expect(densityOf(fixture("wide.png"))).toBeNull();
  });

  it("keeps a density the picture already has", () => {
    const once = withDensity(fixture("pixel.png"), 150);
    expect(withDensity(once, 300)).toEqual(once);
    expect(densityOf(once)).toBe(150);
  });

  it("does not touch what is not a PNG", () => {
    const jpeg = fixture("photo.jpg");
    expect(withDensity(jpeg, 300)).toBe(jpeg);
    const cut = fixture("wide.png").slice(0, 20);
    expect(withDensity(cut, 300)).toBe(cut);
    expect(withDensity(new Uint8Array(), 300)).toEqual(new Uint8Array());
    expect(densityOf(jpeg)).toBeNull();
    expect(sizeOf(jpeg)).toBeNull();
  });

  it("stops at a chunk that claims more bytes than the file has", () => {
    const png = fixture("wide.png").slice();
    // The first chunk after the header says it is 4 GB long.
    new DataView(png.buffer).setUint32(33, 0xffff_fff0);
    expect(densityOf(png)).toBeNull();
    expect(withDensity(png, 300).length).toBe(png.length + 21);
  });
});
