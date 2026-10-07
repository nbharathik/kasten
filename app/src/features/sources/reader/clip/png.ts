// Two small things about a PNG that a canvas made: the density it is meant to
// be printed at, and its size. A canvas writes a PNG that says nothing of
// density, so a figure drawn at 300 dpi would be placed at 96 dpi (three times
// too big) by a program that sizes pictures by their physical size. The
// density goes in as a pHYs chunk, right after the header, where the format
// wants it.

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** The signature (8 bytes) and the header chunk (12 bytes around 13 bytes of data). */
const HEADER_END = 33;
const METRE_IN_INCHES = 1 / 0.0254;

let table: Uint32Array | null = null;

/** The CRC-32 the format keeps at the end of each chunk. */
function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const name = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);

const isPng = (bytes: Uint8Array) => bytes.length >= HEADER_END && SIGNATURE.every((byte, i) => bytes[i] === byte) && name(bytes, 12) === "IHDR";

/** Where the data of the first chunk of this type is, and how long it is; null when there is none (or the file is cut off). */
function find(bytes: Uint8Array, type: string): { at: number; length: number } | null {
  const data = view(bytes);
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = data.getUint32(at);
    if (at + 12 + length > bytes.length) return null;
    if (name(bytes, at + 4) === type) return { at: at + 8, length };
    at += 12 + length;
  }
  return null;
}

/** The picture's size in pixels; null when it is not a PNG. */
export function sizeOf(png: Uint8Array): { width: number; height: number } | null {
  if (!isPng(png)) return null;
  const data = view(png);
  return { width: data.getUint32(16), height: data.getUint32(20) };
}

/** The dots an inch the picture says it is meant for, when it says so in inches or metres. */
export function densityOf(png: Uint8Array): number | null {
  if (!isPng(png)) return null;
  const phys = find(png, "pHYs");
  if (!phys || phys.length !== 9 || png[phys.at + 8] !== 1) return null;
  return Math.round(view(png).getUint32(phys.at) / METRE_IN_INCHES);
}

/** The PNG with a pHYs chunk that says it is meant for `dpi` dots an inch. One that has a density, or is not a PNG, comes back as it is. */
export function withDensity(png: Uint8Array, dpi: number): Uint8Array {
  if (!isPng(png) || find(png, "pHYs")) return png;
  const chunk = new Uint8Array(21);
  const data = view(chunk);
  data.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  const perMetre = Math.round(dpi * METRE_IN_INCHES);
  data.setUint32(8, perMetre);
  data.setUint32(12, perMetre);
  chunk[16] = 1;
  data.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, HEADER_END));
  out.set(chunk, HEADER_END);
  out.set(png.subarray(HEADER_END), HEADER_END + chunk.length);
  return out;
}
