// For the tests: a PNG read back into pixels, so a clip is checked by what it
// shows and not only by its size. It reads what a canvas writes (8 bits a
// channel, RGB or RGBA, no interlacing) and nothing else.

import { inflateSync } from "node:zlib";

export interface Picture {
  width: number;
  height: number;
  /** The colour at a pixel, as [red, green, blue, alpha]. */
  at(x: number, y: number): [number, number, number, number];
}

export function decodePng(png: Uint8Array): Picture {
  const data = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = data.getUint32(16);
  const height = data.getUint32(20);
  const [depth, kind, , , interlace] = [png[24], png[25], png[26], png[27], png[28]];
  if (depth !== 8 || (kind !== 2 && kind !== 6) || interlace !== 0) throw new Error(`Cannot read this PNG (depth ${depth}, type ${kind}, interlace ${interlace})`);
  const channels = kind === 6 ? 4 : 3;
  const parts: Uint8Array[] = [];
  for (let at = 8; at + 12 <= png.length; ) {
    const length = data.getUint32(at);
    if (String.fromCharCode(...png.slice(at + 4, at + 8)) === "IDAT") parts.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const packed = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)]!;
    const line = packed.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? rows[y * stride + i - channels]! : 0;
      const up = y > 0 ? rows[(y - 1) * stride + i]! : 0;
      const upLeft = y > 0 && i >= channels ? rows[(y - 1) * stride + i - channels]! : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      rows[y * stride + i] = (line[i]! + predicted) & 255;
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const from = y * stride + x * channels;
      return [rows[from]!, rows[from + 1]!, rows[from + 2]!, channels === 4 ? rows[from + 3]! : 255];
    },
  };
}
