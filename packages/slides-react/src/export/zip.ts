// A ZIP file of stored (uncompressed) entries. It holds the pictures of a deck
// when there are many: PNGs are compressed already, so storing them costs
// nothing and keeps this to a page of code.

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const MAX_ENTRIES = 0xffff;
const MAX_NAME = 0xffff;
/** Without ZIP64 no size or offset can pass this. */
const MAX_BYTES = 0xffffffff;

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of the bytes, the checksum ZIP keeps for each file. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A time as ZIP writes it: two seconds to the unit, and years from 1980. */
function dosStamp(when: Date): { time: number; date: number } {
  const year = Math.min(Math.max(when.getFullYear(), 1980), 2107);
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/** The files as one ZIP archive, stored as they are. Names are written as UTF-8. */
export function zipStored(entries: readonly ZipEntry[], when: Date = new Date()): Uint8Array {
  if (entries.length > MAX_ENTRIES) throw new Error(`A zip file holds at most ${MAX_ENTRIES} files.`);
  const encoder = new TextEncoder();
  const { time, date } = dosStamp(when);
  const named = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    if (name.length === 0 || name.length > MAX_NAME) throw new Error(`A file in a zip needs a name of 1 to ${MAX_NAME} bytes.`);
    return { name, bytes: entry.bytes, crc: crc32(entry.bytes) };
  });
  const total = named.reduce((sum, e) => sum + 30 + e.name.length + e.bytes.length + 46 + e.name.length, 22);
  if (total > MAX_BYTES) throw new Error("These files are too large for one zip file.");

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  const offsets: number[] = [];
  for (const e of named) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, 0x0800, true); // names are UTF-8
    view.setUint16(at + 8, 0, true); // stored
    view.setUint16(at + 10, time, true);
    view.setUint16(at + 12, date, true);
    view.setUint32(at + 14, e.crc, true);
    view.setUint32(at + 18, e.bytes.length, true);
    view.setUint32(at + 22, e.bytes.length, true);
    view.setUint16(at + 26, e.name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(e.name, at + 30);
    out.set(e.bytes, at + 30 + e.name.length);
    at += 30 + e.name.length + e.bytes.length;
  }
  const directory = at;
  named.forEach((e, i) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, 0x0800, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, time, true);
    view.setUint16(at + 14, date, true);
    view.setUint32(at + 16, e.crc, true);
    view.setUint32(at + 20, e.bytes.length, true);
    view.setUint32(at + 24, e.bytes.length, true);
    view.setUint16(at + 28, e.name.length, true);
    // Extra field, comment, disk number, internal and external attributes: all empty.
    view.setUint32(at + 42, offsets[i] as number, true);
    out.set(e.name, at + 46);
    at += 46 + e.name.length;
  });
  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, named.length, true);
  view.setUint16(at + 10, named.length, true);
  view.setUint32(at + 12, at - directory, true);
  view.setUint32(at + 16, directory, true);
  return out;
}
