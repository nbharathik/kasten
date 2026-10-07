import { describe, expect, it } from "vitest";

import { alignSequences } from "./align";
import { loadMarkdown, rebaseSnapshot, saveMarkdown, type BlockRange, type MarkdownCodec } from "./lossless";

// A toy "Markdown": `# ` lines are headings (and interrupt paragraphs), `[x]: url`
// lines are definitions, everything else forms paragraphs split by blank lines.
// Nodes are strings like "P:text" or "H:text". The serializer is lossy on
// purpose (collapses whitespace), like every real one.
const toy: MarkdownCodec<string> = {
  blockRanges(md) {
    const ranges: BlockRange[] = [];
    const lines = md.split(/(?<=\n)/);
    let pos = 0;
    let open: BlockRange | null = null;
    for (const line of lines) {
      const text = line.replace(/\r?\n$/, "");
      const end = pos + text.replace(/\s+$/, "").length;
      if (text.trim() === "") {
        open = null;
      } else if (text.startsWith("# ") || /^\[\w+\]:/.test(text)) {
        ranges.push({ start: pos, end, context: text.startsWith("[") });
        open = null;
      } else if (open) {
        open.end = end;
      } else {
        open = { start: pos, end };
        ranges.push(open);
      }
      pos += line.length;
    }
    return ranges;
  },
  parse(md) {
    const defs = new Map<string, string>();
    for (const m of md.matchAll(/^\[(\w+)\]:\s*(\S+)/gm)) defs.set(m[1]!, m[2]!);
    return toy
      .blockRanges(md)
      .filter((r) => !r.context)
      .map((r) => {
        const text = md.slice(r.start, r.end);
        if (text.startsWith("# ")) return `H:${text.slice(2).trim()}`;
        const resolved = text.replace(/\[(\w+)\]/g, (all, id: string) => (defs.has(id) ? `<${defs.get(id)}>` : all));
        // "a || b" becomes two nodes, like editors that split one Markdown
        // block into several (an image lifted out of its paragraph).
        return resolved.split(" || ").map((part) => `P:${part.replace(/\s+/g, " ").trim()}`);
      })
      .flat();
  },
  serialize(nodes) {
    return nodes.map((n) => (n.startsWith("H:") ? `# ${n.slice(2)}` : n.slice(2))).join("\n\n");
  },
  eq: (a, b) => a === b,
  typeOf: (n) => n.slice(0, 1),
};

function roundTrip(body: string): string {
  const { nodes, snapshot } = loadMarkdown(toy, body);
  return saveMarkdown(toy, snapshot, nodes);
}

function edit(body: string, change: (nodes: string[]) => string[]): string {
  const { nodes, snapshot } = loadMarkdown(toy, body);
  return saveMarkdown(toy, snapshot, change([...nodes]));
}

describe("lossless load and save", () => {
  it.each([
    ["plain", "One\n\nTwo\n"],
    ["odd spacing kept", "odd   spacing\nwrapped  line\n\n\n\nafter   three blanks   \n"],
    ["leading blank lines and no final newline", "\n\n  \nFirst\n\nLast"],
    ["CRLF", "# Title\r\nText\r\n\r\nMore\r\n"],
    ["definitions", "See [x] here.\n\n[x]: http://u\n"],
    ["empty", ""],
    ["whitespace only", "\n  \n\t\n"],
  ])("round-trips %s byte for byte", (_name, body) => {
    expect(roundTrip(body)).toBe(body);
  });

  it("re-serializes only the edited block", () => {
    const body = "odd   spacing   one\n\nMiddle\n\n  indented   three  \n";
    const out = edit(body, (n) => n.map((x) => (x === "P:Middle" ? "P:Middle edited" : x)));
    expect(out).toBe("odd   spacing   one\n\nMiddle edited\n\n  indented   three  \n");
  });

  it("inserts a new block with a blank line on both sides", () => {
    const out = edit("A  a\n\nB  b\n", (n) => [n[0]!, "P:new", n[1]!]);
    expect(out).toBe("A  a\n\nnew\n\nB  b\n");
  });

  it("drops a deleted block together with its gap", () => {
    expect(edit("A\n\n\nB\n\nC\n", (n) => [n[0]!, n[2]!])).toBe("A\n\nC\n");
  });

  it("starts the note where it started when its first block is deleted", () => {
    expect(edit("A\n\nB\n", (n) => [n[1]!])).toBe("B\n");
    expect(edit("\n\nA\n\nB\n", (n) => [n[1]!])).toBe("\n\nB\n");
    expect(edit("A\n\nB\n\nC\n", (n) => ["P:B edited", n[2]!])).toBe("B edited\n\nC\n");
  });

  it("keeps definitions verbatim and resolves references through them", () => {
    const body = "See [x].\n\n[x]:   http://u\n\nOther\n";
    const { nodes } = loadMarkdown(toy, body);
    expect(nodes).toEqual(["P:See <http://u>.", "P:Other"]);
    const out = edit(body, (n) => [n[0]!, "P:Other edited"]);
    expect(out).toBe("See [x].\n\n[x]:   http://u\n\nOther edited\n");
  });

  it("does not mistake an editor's filler paragraph for content", () => {
    // Like Milkdown: a parse with nothing visible still yields an empty paragraph.
    const filler: MarkdownCodec<string> = { ...toy, parse: (md) => (toy.parse(md).length ? toy.parse(md) : ["P:"]) };
    const body = "See [x].\n\n[x]: http://u\n";
    const { nodes, snapshot } = loadMarkdown(filler, body);
    expect(nodes).toEqual(["P:See <http://u>."]);
    expect(saveMarkdown(filler, snapshot, nodes)).toBe(body);
  });

  it("ignores empty nodes the editor adds, such as a trailing paragraph", () => {
    const body = "A  a\n";
    expect(edit(body, (n) => [...n, "P:"])).toBe(body);
  });

  it("puts a blank line between re-serialized text and a verbatim neighbour", () => {
    // Turning the heading into a paragraph must not merge it into "Text".
    const out = edit("# Title\nText  here\n", (n) => ["P:Title", n[1]!]);
    expect(out).toBe("Title\n\nText  here\n");
    expect(toy.parse(out)).toEqual(["P:Title", "P:Text here"]);
  });

  it("writes re-serialized blocks with the note's CRLF line endings", () => {
    const out = edit("# T\r\n\r\nA\r\n", (n) => [n[0]!, "H:B"]);
    expect(out).toBe("# T\r\n\r\n# B\r\n");
  });

  it("ends a note typed into an empty file with a newline", () => {
    expect(edit("", () => ["P:Hello"])).toBe("Hello\n");
  });

  it("edits the right one of two identical blocks", () => {
    const out = edit("Same  x\n\nSame  x\n\nEnd\n", (n) => [n[0]!, "P:Changed", n[2]!]);
    expect(out).toBe("Same  x\n\nChanged\n\nEnd\n");
  });

  it("re-serializes a block whose nodes were split apart by an insertion", () => {
    const body = "left  a || right  b\n\nEnd\n";
    const out = edit(body, (n) => [n[0]!, "P:inserted", n[1]!, n[2]!]);
    expect(toy.parse(out)).toEqual(["P:left a", "P:inserted", "P:right b", "P:End"]);
  });

  it("keeps every block when one is moved", () => {
    const out = edit("A  1\n\nB  2\n\nC  3\n", (n) => [n[1]!, n[2]!, n[0]!]);
    expect(toy.parse(out)).toEqual(["P:B 2", "P:C 3", "P:A 1"]);
    expect(out).toContain("B  2\n\nC  3");
  });

  it("falls back to one block when the tokenizer's ranges are unusable", () => {
    const broken: MarkdownCodec<string> = { ...toy, blockRanges: () => [{ start: 5, end: 2 }] };
    const body = "\nA  a\n\nB\n";
    const { nodes, snapshot } = loadMarkdown(broken, body);
    expect(saveMarkdown(broken, snapshot, nodes)).toBe(body);
  });
});

describe("rebaseSnapshot", () => {
  it("adopts nodes the editor normalised on load", () => {
    const { snapshot } = loadMarkdown(toy, "A\n\nB\n");
    const normalised = ["P:A", "P:B", "P:"];
    const rebased = rebaseSnapshot(toy, snapshot, normalised);
    expect(saveMarkdown(toy, rebased, normalised)).toBe("A\n\nB\n");
  });

  it("refuses nodes that do not line up by type", () => {
    const { snapshot } = loadMarkdown(toy, "A\n\nB\n");
    expect(rebaseSnapshot(toy, snapshot, ["H:A", "P:B"])).toBe(snapshot);
    expect(rebaseSnapshot(toy, snapshot, ["P:A"])).toBe(snapshot);
  });
});

describe("alignSequences", () => {
  const eq = (a: string, b: string) => a === b;

  it("matches a common subsequence in order", () => {
    expect(alignSequences(["a", "b", "c", "d"], ["a", "x", "c", "d"], eq)).toEqual([0, -1, 2, 3]);
    expect(alignSequences(["a", "b"], ["b", "a"], eq).filter((i) => i >= 0)).toHaveLength(1);
  });

  it("handles empty sides", () => {
    expect(alignSequences([], ["a"], eq)).toEqual([]);
    expect(alignSequences(["a"], [], eq)).toEqual([-1]);
  });

  it("gives up on huge rewrites instead of allocating a huge table", () => {
    const before = Array.from({ length: 3000 }, (_, i) => `b${i}`);
    const after = Array.from({ length: 3000 }, (_, i) => `a${i}`);
    expect(alignSequences(before, after, eq).every((i) => i === -1)).toBe(true);
  });
});

describe("lossless properties (seeded random notes and edits)", () => {
  // Small deterministic PRNG so failures reproduce without a test dependency.
  function rng(seed: number) {
    let s = seed >>> 0;
    return (n: number) => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s % n;
    };
  }
  const words = ["alpha", "beta", "gamma", "delta", "kasten", "note"];
  const gaps = ["\n\n", "\n\n\n", "  \n\n", "\n \n", "\r\n\r\n"];

  function randomBody(r: (n: number) => number): string {
    let body = r(3) === 0 ? "\n" : "";
    const blocks = 1 + r(7);
    for (let i = 0; i < blocks; i++) {
      if (i > 0) body += gaps[r(gaps.length)];
      const kind = r(6);
      if (kind === 0) body += `# ${words[r(6)]}`;
      else if (kind === 1) body += `[d${i}]: http://example.com/${i}`;
      else if (kind === 2) body += `${words[r(6)]} || ${words[r(6)]}  ${words[r(6)]}`;
      else body += Array.from({ length: 1 + r(5) }, () => words[r(6)]).join(r(2) ? "  " : "\n");
    }
    return body + ["", "\n", "\n\n"][r(3)];
  }

  function randomEdits(r: (n: number) => number, nodes: string[]): string[] {
    const out = [...nodes];
    for (let step = r(4); step >= 0; step--) {
      const op = r(4);
      const i = r(out.length + 1);
      if (op === 0 && out.length > 0) out[i % out.length] = `P:edited ${step}`;
      else if (op === 1) out.splice(i, 0, r(2) ? `H:new ${step}` : `P:new ${step}`);
      else if (op === 2 && out.length > 0) out.splice(i % out.length, 1);
      else if (op === 3 && out.length > 1) out.push(...out.splice(i % out.length, 1));
    }
    return out;
  }

  it("never changes a note that was not edited", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const body = randomBody(rng(seed));
      expect(roundTrip(body), `seed ${seed}`).toBe(body);
    }
  });

  it("always saves exactly what the editor holds", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed);
      const body = randomBody(r);
      const { nodes, snapshot } = loadMarkdown(toy, body);
      const current = randomEdits(r, nodes);
      const saved = saveMarkdown(toy, snapshot, current);
      const expected = current.filter((n) => n.length > 2);
      expect(toy.parse(saved), `seed ${seed}: ${JSON.stringify(body)} -> ${JSON.stringify(saved)}`).toEqual(expected);
    }
  });
});

describe("lossless saves that would fuse neighbouring blocks", () => {
  // Like CommonMark: lists with the same marker fuse across blank lines. The
  // serializer alternates markers between adjacent lists, as remark does.
  const listToy: MarkdownCodec<string> = {
    blockRanges(md) {
      const ranges: (BlockRange & { marker?: string })[] = [];
      let open: (BlockRange & { marker?: string }) | null = null;
      let pos = 0;
      for (const line of md.split(/(?<=\n)/)) {
        const text = line.replace(/\r?\n$/, "");
        const m = /^([-*]) /.exec(text);
        if (m && open && open.marker === m[1]) open.end = pos + text.length;
        else if (m) ranges.push((open = { start: pos, end: pos + text.length, marker: m[1] }));
        else if (text.trim() !== "") {
          open = null;
          ranges.push({ start: pos, end: pos + text.length });
        }
        pos += line.length;
      }
      return ranges.map(({ start, end }) => ({ start, end }));
    },
    parse(md) {
      return listToy.blockRanges(md).map((r) => {
        const text = md.slice(r.start, r.end);
        if (!/^[-*] /.test(text)) return `P:${text}`;
        const items = text.split(/\r?\n/).filter((l) => /^[-*] /.test(l));
        return `L:${items.map((l) => l.slice(2)).join("|")}`;
      });
    },
    serialize(nodes) {
      let marker = "*";
      return nodes
        .map((n) => {
          if (!n.startsWith("L:")) return n.slice(2);
          marker = marker === "-" ? "*" : "-";
          return n
            .slice(2)
            .split("|")
            .map((item) => `${marker} ${item}`)
            .join("\n");
        })
        .join("\n\n");
    },
    eq: (a, b) => a === b,
    typeOf: (n) => n.slice(0, 1),
  };

  it("re-writes only the neighbour that fuses, never the one on the other side", () => {
    // Serializing the paragraph would collapse its double space.
    const lossy: MarkdownCodec<string> = {
      ...listToy,
      serialize: (nodes) => listToy.serialize(nodes).replace(/ {2,}/g, " "),
    };
    const body = "- a\n\n* b\n\npara  kept\n";
    const { snapshot } = loadMarkdown(lossy, body);
    const out = saveMarkdown(lossy, snapshot, ["L:a", "L:b2", "P:para  kept"]);
    expect(lossy.parse(out)).toEqual(["L:a", "L:b2", "P:para  kept"]);
    expect(out.endsWith("\n\npara  kept\n")).toBe(true);
  });

  it("does not drag neighbours in when a block cannot be written faithfully at all", () => {
    // "X:" nodes are written as paragraphs: no amount of widening fixes that.
    const limited: MarkdownCodec<string> = {
      ...listToy,
      serialize: (nodes) => listToy.serialize(nodes.map((n) => (n.startsWith("X:") ? `P:${n.slice(2)}` : n))),
    };
    const body = "* a\n\nold\n\n* b\n";
    const { snapshot } = loadMarkdown(limited, body);
    expect(saveMarkdown(limited, snapshot, ["L:a", "X:new", "L:b"])).toBe("* a\n\nnew\n\n* b\n");
  });

  it("re-serializes the neighbour too when two lists would fuse", () => {
    const body = "* a\n\n- b\n";
    const { nodes, snapshot } = loadMarkdown(listToy, body);
    expect(nodes).toEqual(["L:a", "L:b"]);
    const out = saveMarkdown(listToy, snapshot, ["L:a2", "L:b"]);
    expect(listToy.parse(out)).toEqual(["L:a2", "L:b"]);
  });

  it("always saves exactly what the editor holds (seeded)", () => {
    let s = 7;
    const r = (n: number) => ((s = (s * 1664525 + 1013904223) >>> 0), s % n);
    for (let seed = 0; seed < 400; seed++) {
      const blocks: string[] = [];
      let lastMarker = "";
      for (let i = 0, n = 1 + r(6); i < n; i++) {
        if (r(3) === 0) {
          blocks.push(`para ${r(9)}`);
          lastMarker = "";
        } else {
          let marker = r(2) ? "-" : "*";
          if (marker === lastMarker) marker = marker === "-" ? "*" : "-";
          lastMarker = marker;
          blocks.push(Array.from({ length: 1 + r(3) }, () => `${marker} item ${r(9)}`).join("\n"));
        }
      }
      const body = blocks.join("\n\n") + "\n";
      const { nodes, snapshot } = loadMarkdown(listToy, body);
      expect(saveMarkdown(listToy, snapshot, nodes), `seed ${seed}`).toBe(body);
      const current = [...nodes];
      const i = r(current.length);
      current[i] = current[i]!.startsWith("L:") ? `L:changed ${seed}` : `P:changed ${seed}`;
      if (r(2)) current.splice(r(current.length + 1), 0, `L:inserted ${seed}`);
      const saved = saveMarkdown(listToy, snapshot, current);
      expect(listToy.parse(saved), `seed ${seed}: ${JSON.stringify(body)} -> ${JSON.stringify(saved)}`).toEqual(current);
    }
  });
});
