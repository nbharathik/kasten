// A picture's size in pixels from its first bytes, without decoding it (the
// core's crates/slides-assets/src/probe.rs, for the kinds a browser preview
// can be given): PNG, GIF, JPEG, WebP and SVG. Null when it cannot be told.

const ascii = (b: Uint8Array, at: number, text: string) => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const be32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const be16 = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const le16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const le24 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);

function jpeg(b: Uint8Array): [number, number] | null {
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = b[at + 1]!;
    if (marker === 0xff) at++;
    else if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) at += 2;
    else if (marker === 0xd9 || marker === 0xda) return null;
    else {
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return at + 9 <= b.length ? [be16(b, at + 7), be16(b, at + 5)] : null;
      at += 2 + be16(b, at + 2);
    }
  }
  return null;
}

function webp(b: Uint8Array): [number, number] | null {
  if (ascii(b, 12, "VP8 ") && b.length >= 30) return [le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff];
  if (ascii(b, 12, "VP8L") && b.length >= 25) {
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  if (ascii(b, 12, "VP8X") && b.length >= 30) return [le24(b, 24) + 1, le24(b, 27) + 1];
  return null;
}

function svg(b: Uint8Array): [number, number] | null {
  const text = new TextDecoder().decode(b.subarray(0, 16 * 1024));
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const attribute = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
  const length = (value: string | undefined) => {
    const m = /^\s*([0-9.]+)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(value ?? "");
    if (!m) return null;
    const per = { pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[(m[2] ?? "").toLowerCase()] ?? 1;
    return Number(m[1]) * per;
  };
  const view = attribute("viewBox")?.split(/[\s,]+/).filter(Boolean).map(Number);
  const box = view && view.length === 4 && view.every(Number.isFinite) && view[2]! > 0 && view[3]! > 0 ? view : null;
  let w = length(attribute("width"));
  let h = length(attribute("height"));
  if (w && !h && box) h = (w * box[3]!) / box[2]!;
  else if (h && !w && box) w = (h * box[2]!) / box[3]!;
  else if (!w && !h && box) [w, h] = [box[2]!, box[3]!];
  return w && h ? [Math.round(w), Math.round(h)] : null;
}

/** The width and height in pixels, or null when the bytes are not a picture this can read. */
export function pictureSize(b: Uint8Array): { w: number; h: number } | null {
  let size: [number, number] | null;
  if (ascii(b, 1, "PNG") && b[0] === 0x89 && ascii(b, 12, "IHDR") && b.length >= 24) size = [be32(b, 16), be32(b, 20)];
  else if (ascii(b, 0, "GIF8") && b.length >= 10) size = [le16(b, 6), le16(b, 8)];
  else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) size = jpeg(b);
  else if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) size = webp(b);
  else size = svg(b);
  return size && size[0] >= 1 && size[1] >= 1 && size[0] <= 0x7fffffff && size[1] <= 0x7fffffff ? { w: size[0], h: size[1] } : null;
}
