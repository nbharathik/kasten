import { describe, expect, it } from "vitest";

import { crc32, zipStored } from "./zip.ts";

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

/** A reader written from the format's description, to check what the writer made: the entries as the central directory lists them. */
function readZip(zip: Uint8Array): { name: string; bytes: Uint8Array; crc: number; method: number; flags: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  expect(end).toBeGreaterThanOrEqual(0);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    // The local header repeats the name and is followed by the data.
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localName = view.getUint16(local + 26, true);
    const localExtra = view.getUint16(local + 28, true);
    const start = local + 30 + localName + localExtra;
    out.push({ name, bytes: zip.subarray(start, start + size), crc, method, flags });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

describe("crc32", () => {
  it("is the standard checksum", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("a stored zip", () => {
  const when = new Date(2026, 8, 29, 18, 30, 12);

  it("holds each file's bytes as they were, with a checksum that matches", () => {
    const zip = zipStored(
      [
        { name: "01.png", bytes: Uint8Array.from([137, 80, 78, 71, 0, 255, 1]) },
        { name: "02.png", bytes: text("second") },
      ],
      when,
    );
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["01.png", "02.png"]);
    expect([...(entries[0]?.bytes ?? [])]).toEqual([137, 80, 78, 71, 0, 255, 1]);
    expect(new TextDecoder().decode(entries[1]?.bytes)).toBe("second");
    for (const e of entries) {
      expect(e.method).toBe(0);
      expect(e.crc).toBe(crc32(e.bytes));
    }
  });

  it("says its names are UTF-8, and keeps them", () => {
    const [entry] = readZip(zipStored([{ name: "Übersicht – 01.png", bytes: text("x") }], when));
    expect(entry?.name).toBe("Übersicht – 01.png");
    expect((entry?.flags ?? 0) & 0x0800).toBe(0x0800);
  });

  it("is a valid empty archive with no files", () => {
    const zip = zipStored([], when);
    expect(zip).toHaveLength(22);
    expect(readZip(zip)).toEqual([]);
  });

  it("is the same bytes for the same files and time", () => {
    const files = [{ name: "a.png", bytes: text("a") }];
    expect(zipStored(files, when)).toEqual(zipStored(files, when));
  });

  it("stamps the time it is given, in the format zip uses", () => {
    const zip = zipStored([{ name: "a", bytes: text("a") }], when);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const time = view.getUint16(10, true);
    const date = view.getUint16(12, true);
    expect([time >> 11, (time >> 5) & 63, (time & 31) * 2]).toEqual([18, 30, 12]);
    expect([(date >> 9) + 1980, (date >> 5) & 15, date & 31]).toEqual([2026, 9, 29]);
  });

  it("refuses more files than the format can count, and a name it cannot write", () => {
    expect(() => zipStored(Array.from({ length: 65536 }, (_, i) => ({ name: `${i}`, bytes: new Uint8Array() })))).toThrow(/65535/);
    expect(() => zipStored([{ name: "", bytes: new Uint8Array() }])).toThrow(/name/);
    expect(() => zipStored([{ name: "x".repeat(70000), bytes: new Uint8Array() }])).toThrow(/name/);
  });
});
